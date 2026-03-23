import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { createHash } from 'crypto';
import {
  DEFAULT_INITIAL_PRICE,
  DEFAULT_POLICY_VERSION,
  DEFAULT_SALES_VELOCITY_BPS,
  DEFAULT_TIME_ELAPSED,
  DEFAULT_ZK_PROVIDER,
  PROOF_TTL_SECONDS,
  SCORING_MODEL_HASH,
  serializeShieldPayloadV0,
  modeToCode,
  type PayloadRaw,
} from '@/services/shield-oracle/src/shield_score';
import { oracleKeypair, oraclePubkeyBase58 } from '@/services/shield-oracle/src/oracle';

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function parseWallet(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const wallet = (body as { wallet?: unknown }).wallet;
  return typeof wallet === 'string' && wallet.length > 0 ? wallet : null;
}

function parseBigIntField(body: unknown, key: 'initial_price' | 'sales_velocity_bps' | 'time_elapsed', fallback: bigint): bigint {
  if (!body || typeof body !== 'object') return fallback;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return fallback;
}

/**
 * Demo quote fixture: same payload shape and Ed25519 sign as live Oracle,
 * but no Redis, no rate limit, no Reclaim. Uses ORACLE_KEYPAIR_PATH / ORACLE_PRIVATE_KEY.
 * Chain must have been initialized with this same oracle pubkey (init_admin_v2).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const walletBase58 = parseWallet(body);
    if (!walletBase58) {
      return NextResponse.json(
        { error: 'Missing wallet', reason: 'missing_wallet' },
        { status: 400 }
      );
    }

    const user = new PublicKey(walletBase58);
    const now = Math.floor(Date.now() / 1000);
    const nonce = BigInt(now) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const expiry = BigInt(now + PROOF_TTL_SECONDS);
    const zkProofHash = Uint8Array.from(createHash('sha256').update(JSON.stringify([])).digest());

    const payload: PayloadRaw = {
      policy_version: DEFAULT_POLICY_VERSION,
      user_pubkey: user.toBytes(),
      initial_price: parseBigIntField(body, 'initial_price', DEFAULT_INITIAL_PRICE),
      sales_velocity_bps: parseBigIntField(body, 'sales_velocity_bps', DEFAULT_SALES_VELOCITY_BPS),
      time_elapsed: parseBigIntField(body, 'time_elapsed', DEFAULT_TIME_ELAPSED),
      dignity_score: 25,
      adapter_mask: 0,
      user_mode: modeToCode('guest'),
      zk_provider: DEFAULT_ZK_PROVIDER,
      zk_proof_hash: zkProofHash,
      scoring_model_hash: Uint8Array.from(SCORING_MODEL_HASH),
      attestation_expiry: expiry,
      nonce,
    };

    const payloadBytes = serializeShieldPayloadV0(payload);
    const oracle = oracleKeypair();
    const signature = nacl.sign.detached(payloadBytes, oracle.secretKey);

    const scoringModelHashHex = toHex(Uint8Array.from(SCORING_MODEL_HASH));
    return NextResponse.json({
      dignity_score: 25,
      payload: {
        policy_version: payload.policy_version,
        user_pubkey: walletBase58,
        initial_price: payload.initial_price.toString(),
        sales_velocity_bps: payload.sales_velocity_bps.toString(),
        time_elapsed: payload.time_elapsed.toString(),
        dignity_score: payload.dignity_score,
        adapter_mask: payload.adapter_mask,
        user_mode: payload.user_mode,
        zk_provider: payload.zk_provider,
        zk_proof_hash_hex: toHex(payload.zk_proof_hash),
        scoring_model_hash_hex: scoringModelHashHex,
        attestation_expiry: payload.attestation_expiry.toString(),
        nonce: payload.nonce.toString(),
      },
      payload_hex: toHex(payloadBytes),
      oracle_signature_hex: toHex(signature),
      oracle_pubkey: oraclePubkeyBase58(),
      scoring_model_hash_hex: scoringModelHashHex,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'quote-fixture failed';
    if (msg.includes('Oracle') || msg.includes('ORACLE') || msg.includes('key')) {
      return NextResponse.json(
        { error: msg, reason: 'oracle_config_required' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: msg, reason: 'internal_error' },
      { status: 500 }
    );
  }
}
