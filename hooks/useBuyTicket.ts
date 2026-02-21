import { useCallback, useState } from 'react';
import {
  Connection,
  PublicKey,
  Transaction,
  Ed25519Program,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';

/**
 * Project UNFORGIVEN - useBuyTicket Hook (Spec 3.3 / 3.4)
 * 构建 Ed25519 验证 + buyTicket 交易；sig_instruction_index = 1
 */

// AuthorizationPayload (Spec 3.3): [user_wallet 32][event_id 32][tier_level 1][expiry 8][nonce 8] = 81 bytes LE
function buildAuthorizationPayload(
  userWallet: PublicKey,
  eventId: PublicKey,
  tierLevel: number,
  expiry: number,
  nonce: bigint
): Buffer {
  const message = Buffer.alloc(81);
  let offset = 0;
  userWallet.toBuffer().copy(message, offset, 0, 32);
  offset += 32;
  eventId.toBuffer().copy(message, offset, 0, 32);
  offset += 32;
  message.writeUInt8(tierLevel, offset);
  offset += 1;
  message.writeBigInt64LE(BigInt(expiry), offset);
  offset += 8;
  message.writeBigUInt64LE(nonce, offset);
  return message;
}

// GlobalState 布局：8 discriminator + authority(32) + oracle(32) + target_rate(8) + start_time(8) + base_price(8) + items_sold(8) + bump(1)
const ITEMS_SOLD_OFFSET = 8 + 32 + 32 + 8 + 8 + 8;

export interface BuyTicketParams {
  connection: Connection;
  wallet: WalletContextState;
  program: Program;
  apiBaseUrl?: string; // 默认 '/api'，用于 Next.js
  proof?: unknown;
}

export interface BuyTicketResult {
  txSignature?: string;
  error?: string;
}

function normalizeSignedProofPayload(proof: unknown): unknown | undefined {
  if (!proof) return undefined;
  const proofs = Array.isArray(proof) ? proof : [proof];
  const signed = proofs.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const signatures = (item as { signatures?: unknown }).signatures;
    return Array.isArray(signatures) && signatures.length > 0;
  });
  if (signed.length === 0) return undefined;
  return Array.isArray(proof) ? signed : signed[0];
}

export function useBuyTicket() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyTicket = useCallback(
    async ({
      connection,
      wallet,
      program,
      apiBaseUrl = '/api',
      proof,
    }: BuyTicketParams): Promise<BuyTicketResult> => {
      setLoading(true);
      setError(null);

      try {
        const publicKey = wallet.publicKey;
        if (!publicKey) {
          throw new Error('Wallet not connected');
        }

        // 1. 获取 global_state PDA（event_id 与合约一致）
        const [globalStatePda] = PublicKey.findProgramAddressSync(
          [Buffer.from('global')],
          program.programId
        );

        // 2. 调用 API 获取 Oracle 签名 (AuthorizationPayload)
        const res = await fetch(`${apiBaseUrl}/sign-alpha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: publicKey.toBase58(),
            eventId: globalStatePda.toBase58(),
            proof: normalizeSignedProofPayload(proof),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `API error: ${res.status}`);
        }

        const data = await res.json();
        const {
          tierLevel,
          eventId: eventIdBase58,
          expiry,
          nonce: nonceStr,
          signature: signatureBase64,
          oraclePubkey,
        } = data;

        const signature = Buffer.from(signatureBase64, 'base64');
        const eventIdPk = new PublicKey(eventIdBase58);
        const nonce = new BN(nonceStr, 10);

        const message = buildAuthorizationPayload(
          publicKey,
          eventIdPk,
          tierLevel,
          expiry,
          BigInt(nonceStr)
        );

        // 3. 获取 PDA 地址
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault')],
          program.programId
        );

        // 4. 从链上读取 current items_sold（ticket PDA 的 seed）
        const globalStateAccount = await connection.getAccountInfo(globalStatePda);
        if (!globalStateAccount?.data) {
          throw new Error('Global state not found. Run initialize first.');
        }
        const itemsSold = globalStateAccount.data.readBigUInt64LE(ITEMS_SOLD_OFFSET);

        // ticket PDA seed: [b"ticket", global_state, buyer, items_sold(u64 LE)]
        const itemsSoldSeed = Buffer.alloc(8);
        itemsSoldSeed.writeBigUInt64LE(itemsSold, 0);

        const [ticketPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from('ticket'),
            globalStatePda.toBuffer(),
            publicKey.toBuffer(),
            itemsSoldSeed,
          ],
          program.programId
        );

        // 5. Ed25519 验证指令
        const oraclePubkeyBytes = new PublicKey(oraclePubkey).toBytes();
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: oraclePubkeyBytes,
          message: new Uint8Array(message),
          signature: new Uint8Array(signature),
        });

        // 6. buyTicket 指令 (Spec 3.4): sig_instruction_index=1, event_id, tier_level, expiry, nonce (u64 as BN)
        const buyTicketIx = await program.methods
          .buyTicket(1, globalStatePda, tierLevel, expiry, nonce)
          .accountsPartial({
            buyer: publicKey,
            globalState: globalStatePda,
            vault: vaultPda,
            ticket: ticketPda,
            instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: new PublicKey('11111111111111111111111111111111'),
          })
          .instruction();

        // 7. 构建交易
        const tx = new Transaction();
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
          ed25519Ix,
          buyTicketIx
        );

        // 8. 发送交易
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signedTx = await wallet.signTransaction!(tx);
        const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        setLoading(false);
        return { txSignature };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setLoading(false);
        return { error: msg };
      }
    },
    []
  );

  return { buyTicket, loading, error };
}
