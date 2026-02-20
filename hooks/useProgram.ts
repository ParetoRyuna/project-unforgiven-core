import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import type { Wallet as AnchorWallet } from '@coral-xyz/anchor/dist/cjs/provider';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
// 运行 anchor build 后，可将 target/idl/unforgiven.json 复制到此处覆盖；需包含 types 以兼容 Program 账户解析
import idlJson from '@/app/idl/unforgiven.json';

// 确保 IDL 含 types（GlobalState/Ticket/Vault 等账户类型），否则会报 Accounts require idl.types
const idl = idlJson as Idl;

export const useProgram = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const wallet = useMemo<AnchorWallet | null>(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    return {
      publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
        signTransaction(tx as Transaction | VersionedTransaction) as Promise<T>,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
        signAllTransactions(txs as Array<Transaction | VersionedTransaction>) as Promise<T[]>,
    };
  }, [publicKey, signTransaction, signAllTransactions]);

  const program = useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(
      connection,
      wallet,
      AnchorProvider.defaultOptions()
    );

    return new Program(idl, provider);
  }, [connection, wallet]);

  return { program };
};
