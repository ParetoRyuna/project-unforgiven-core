import { createHash, randomUUID } from 'crypto';
import fs from 'fs';

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';

import type { SnapshotAnchorReceipt, SnapshotAnchorRequest } from './types.ts';

export type SignatureVerificationInput = {
  message_hex: string;
  signature_base64: string;
  public_key_base58: string;
};

export type SignatureVerificationResult = {
  valid: boolean;
  reason?: string;
};

export type NonceIssueResult = {
  nonce: string;
  issued_at: number;
  ttl_seconds: number;
};

export type SubmitTransactionInput = {
  serialized_tx_base64: string;
};

export type SubmitTransactionResult = {
  tx_signature: string;
  mode: 'mock' | 'onchain';
};

export type ConfirmTransactionResult = {
  confirmed: boolean;
  slot: number | null;
  mode: 'mock' | 'onchain';
};

export interface ChainAdapter {
  readonly chain: 'solana';
  verifyAuthorizationSignature(input: SignatureVerificationInput): Promise<SignatureVerificationResult>;
  issueNonce(wallet: string): Promise<NonceIssueResult>;
  submitTransaction(input: SubmitTransactionInput): Promise<SubmitTransactionResult>;
  confirmTransaction(txSignature: string): Promise<ConfirmTransactionResult>;
  anchorSnapshot(input: SnapshotAnchorRequest): Promise<SnapshotAnchorReceipt>;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function loadAnchorSigner(): Keypair | null {
  const fromPath = process.env.HUB_ANCHOR_KEYPAIR_PATH;
  if (!fromPath) return null;
  try {
    const raw = fs.readFileSync(fromPath, 'utf8');
    const arr = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    return null;
  }
}

export class SolanaAdapter implements ChainAdapter {
  public readonly chain = 'solana' as const;
  private readonly mockMode: boolean;
  private readonly connection: Connection;
  private readonly cluster: string;

  constructor(input?: { rpcUrl?: string; mockMode?: boolean }) {
    this.cluster = input?.rpcUrl ?? process.env.HUB_SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';
    this.mockMode = input?.mockMode ?? process.env.HUB_SOLANA_MOCK_MODE === '1';
    this.connection = new Connection(this.cluster, 'confirmed');
  }

  async verifyAuthorizationSignature(input: SignatureVerificationInput): Promise<SignatureVerificationResult> {
    try {
      const message = Buffer.from(input.message_hex, 'hex');
      const signature = Buffer.from(input.signature_base64, 'base64');
      const pubkey = new PublicKey(input.public_key_base58);
      const valid = nacl.sign.detached.verify(message, signature, pubkey.toBytes());
      return { valid };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'signature verify failed' };
    }
  }

  async issueNonce(wallet: string): Promise<NonceIssueResult> {
    const now = Date.now();
    return {
      nonce: sha256Hex(`${wallet}:${now}:${randomUUID()}`).slice(0, 32),
      issued_at: now,
      ttl_seconds: 300,
    };
  }

  async submitTransaction(input: SubmitTransactionInput): Promise<SubmitTransactionResult> {
    if (this.mockMode) {
      return {
        tx_signature: sha256Hex(`mock-submit:${input.serialized_tx_base64}:${Date.now()}`).slice(0, 88),
        mode: 'mock',
      };
    }
    const raw = Buffer.from(input.serialized_tx_base64, 'base64');
    const txSignature = await this.connection.sendRawTransaction(raw);
    return { tx_signature: txSignature, mode: 'onchain' };
  }

  async confirmTransaction(txSignature: string): Promise<ConfirmTransactionResult> {
    if (this.mockMode) {
      return { confirmed: true, slot: null, mode: 'mock' };
    }
    const status = await this.connection.getSignatureStatus(txSignature);
    return {
      confirmed: !!status.value && status.value.confirmationStatus === 'confirmed',
      slot: status.context.slot ?? null,
      mode: 'onchain',
    };
  }

  async anchorSnapshot(input: SnapshotAnchorRequest): Promise<SnapshotAnchorReceipt> {
    if (this.mockMode) {
      return {
        snapshot_hash_hex: input.snapshot_hash_hex,
        snapshot_version: input.snapshot_version,
        anchor_tx_signature: sha256Hex(
          `mock-anchor:${input.snapshot_hash_hex}:${input.snapshot_version}:${input.generated_at}`,
        ).slice(0, 88),
        anchored_at: Date.now(),
        mode: 'mock',
        chain: this.chain,
      };
    }

    const payer = loadAnchorSigner();
    if (!payer) {
      throw new Error('HUB_ANCHOR_KEYPAIR_PATH is required when HUB_SOLANA_MOCK_MODE=0');
    }

    const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memo = Buffer.from(
      JSON.stringify({
        snapshot_hash_hex: input.snapshot_hash_hex,
        snapshot_version: input.snapshot_version,
        generated_at: input.generated_at,
      }),
      'utf8',
    );
    const ix = new TransactionInstruction({
      keys: [],
      programId: memoProgramId,
      data: memo,
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(this.connection, tx, [payer]);

    return {
      snapshot_hash_hex: input.snapshot_hash_hex,
      snapshot_version: input.snapshot_version,
      anchor_tx_signature: signature,
      anchored_at: Date.now(),
      mode: 'onchain',
      chain: this.chain,
    };
  }
}
