'use client';

import { useMemo } from 'react';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import type { Wallet as AnchorWallet } from '@coral-xyz/anchor/dist/cjs/provider';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
// Use app/idl so the app works without running anchor build (demo/reviewer path).
import idlImport from '@/app/idl/unforgiven_v2.json';

const DEFAULT_PROGRAM_ID = new PublicKey('5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW');

function normalizeIdl(idl: Record<string, unknown>, programId: PublicKey): Idl {
  const out = JSON.parse(JSON.stringify(idl)) as Record<string, unknown>;

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;

    const object = value as Record<string, unknown>;
    if (object.type === 'publicKey') {
      object.type = 'pubkey';
    }

    for (const key of Object.keys(object)) {
      object[key] = walk(object[key]);
    }
    return object;
  };

  walk(out);

  const instructions = out.instructions as
    | Array<{ name?: string; discriminator?: number[]; accounts?: Array<Record<string, unknown>> }>
    | undefined;

  if (instructions) {
    for (const instruction of instructions) {
      if (!Array.isArray(instruction.discriminator) && instruction.name) {
        const preimage = `global:${instruction.name.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
        instruction.discriminator = Array.from(sha256(utf8ToBytes(preimage)).slice(0, 8));
      }
      if (instruction.accounts) {
        for (const account of instruction.accounts) {
          if (account.isMut !== undefined && account.writable === undefined) {
            account.writable = !!account.isMut;
          }
          if (account.isSigner !== undefined && account.signer === undefined) {
            account.signer = !!account.isSigner;
          }
        }
      }
    }
  }

  out.address = programId.toBase58();
  out.metadata = {
    ...(typeof out.metadata === 'object' && out.metadata ? out.metadata : {}),
    address: programId.toBase58(),
  };

  return out as Idl;
}

export function useUnforgivenProgram() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const wallet = useWallet();

  const programId = useMemo(() => {
    const value = process.env.NEXT_PUBLIC_PROGRAM_ID;
    return value ? new PublicKey(value) : DEFAULT_PROGRAM_ID;
  }, []);

  const providerWallet = useMemo<AnchorWallet | null>(() => {
    if (anchorWallet) {
      return {
        publicKey: anchorWallet.publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
          anchorWallet.signTransaction(tx as Transaction) as Promise<T>,
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
          anchorWallet.signAllTransactions(txs as Transaction[]) as Promise<T[]>,
      };
    }

    if (!wallet.publicKey || !wallet.signTransaction) return null;

    return {
      publicKey: wallet.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
        wallet.signTransaction!(tx as Transaction | VersionedTransaction) as Promise<T>,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        if (wallet.signAllTransactions) {
          return wallet.signAllTransactions(
            txs as Array<Transaction | VersionedTransaction>,
          ) as Promise<T[]>;
        }
        return Promise.all(
          txs.map((tx) =>
            wallet.signTransaction!(tx as Transaction | VersionedTransaction) as Promise<T>,
          ),
        );
      },
    };
  }, [anchorWallet, wallet]);

  const program = useMemo(() => {
    if (!providerWallet) return null;

    const provider = new AnchorProvider(connection, providerWallet, AnchorProvider.defaultOptions());
    const idl = normalizeIdl(idlImport as Record<string, unknown>, programId);
    return new Program(idl, provider);
  }, [connection, programId, providerWallet]);

  return {
    program,
    programId,
  };
}
