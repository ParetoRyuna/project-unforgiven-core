import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

import {
  applyUserModeToDignityScore,
  computeUniqKey,
  DEFAULT_INITIAL_PRICE,
  DEFAULT_POLICY_VERSION,
  DEFAULT_SALES_VELOCITY_BPS,
  DEFAULT_TIME_ELAPSED,
  DEFAULT_ZK_PROVIDER,
  hashAttestations,
  modeToCode,
  PROOF_TTL_SECONDS,
  SCORING_MODEL_HASH,
  serializeShieldPayloadV0,
  validateAttestationWalletOwnership,
  type PayloadRaw,
  type UserMode,
} from './shield_score.ts';
import { oracleKeypair, oraclePubkeyBase58 } from './oracle.ts';
import { verifyReclaimProofBundle } from './reclaim_verify.ts';
import { computeDignityScore as computeDignityFromAttestations } from '../../dignity-scoring/src/index.ts';

const seenProofByUniq = new Map<string, number>();

type ShieldScoreBody = {
  wallet?: string;
  reclaim_attestations?: Record<string, unknown>[];
  mode?: UserMode;
  initial_price?: string | number;
  sales_velocity_bps?: string | number;
  time_elapsed?: string | number;
  zk_provider?: number;
  policy_version?: number;
  proof_hash_hex?: string;
};

type ShieldScoreResult = {
  status: number;
  body: Record<string, unknown>;
};

function fail(
  status: number,
  reason: string,
  error: string,
  details?: Record<string, unknown>,
): ShieldScoreResult {
  return {
    status,
    body: {
      error,
      reason,
      ...(details ?? {}),
    },
  };
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function cleanupSeen(now: number): void {
  for (const [k, expiry] of seenProofByUniq.entries()) {
    if (expiry <= now) {
      seenProofByUniq.delete(k);
    }
  }
}

export function getOraclePubkeyPayload(): { oraclePubkey: string } {
  return { oraclePubkey: oraclePubkeyBase58() };
}

export async function handleShieldScoreRequest(body: ShieldScoreBody): Promise<ShieldScoreResult> {
  try {
    if (!body.wallet) {
      return fail(400, 'missing_wallet', 'Missing wallet');
    }

    const mode: UserMode = body.mode ?? 'verified';
    if (!['bot_suspected', 'guest', 'verified'].includes(mode)) {
      return fail(400, 'invalid_mode', 'Invalid mode');
    }

    const user = new PublicKey(body.wallet);
    const attestations = body.reclaim_attestations ?? [];

    if (mode === 'verified') {
      const ownership = validateAttestationWalletOwnership(attestations, user.toBase58());
      if (!ownership.valid) {
        return fail(400, 'invalid_attestation_ownership', 'Invalid attestation ownership', {
          details: ownership.reason ?? null,
        });
      }

      const verification = await verifyReclaimProofBundle({
        walletBase58: user.toBase58(),
        attestations,
      });
      if (verification.ok === false) {
        console.warn(
          JSON.stringify({
            event: 'shield_reclaim_rejected',
            wallet: user.toBase58(),
            reason: verification.reason,
            status: verification.status,
          }),
        );
        const statusError =
          verification.status === 503
            ? 'Reclaim verification backend unavailable'
            : 'Reclaim verification rejected';
        return fail(verification.status, verification.reason, statusError);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    cleanupSeen(now);

    const rawDignity = computeDignityFromAttestations(attestations);
    const dignity = applyUserModeToDignityScore(rawDignity, mode);
    const zkProofHash =
      body.proof_hash_hex && /^[0-9a-fA-F]{64}$/.test(body.proof_hash_hex)
        ? fromHex(body.proof_hash_hex.toLowerCase())
        : hashAttestations(attestations);

    const uniq = computeUniqKey(zkProofHash, user.toBytes());
    const existing = seenProofByUniq.get(uniq);
    if (mode === 'verified' && existing && existing > now) {
      return fail(409, 'proof_reused_in_active_window', 'Proof already used in active window');
    }

    const nonce = BigInt(Date.now()) * 1_000n + BigInt(Math.floor(Math.random() * 1_000));
    const expiry = BigInt(now + PROOF_TTL_SECONDS);

    const payload: PayloadRaw = {
      policy_version: body.policy_version ?? DEFAULT_POLICY_VERSION,
      user_pubkey: user.toBytes(),
      initial_price: body.initial_price != null ? BigInt(body.initial_price) : DEFAULT_INITIAL_PRICE,
      sales_velocity_bps:
        body.sales_velocity_bps != null ? BigInt(body.sales_velocity_bps) : DEFAULT_SALES_VELOCITY_BPS,
      time_elapsed: body.time_elapsed != null ? BigInt(body.time_elapsed) : DEFAULT_TIME_ELAPSED,
      dignity_score: dignity.totalScore,
      adapter_mask: dignity.adapterMask,
      user_mode: modeToCode(mode),
      zk_provider: body.zk_provider ?? DEFAULT_ZK_PROVIDER,
      zk_proof_hash: zkProofHash,
      scoring_model_hash: Uint8Array.from(SCORING_MODEL_HASH),
      attestation_expiry: expiry,
      nonce,
    };

    const payloadBytes = serializeShieldPayloadV0(payload);
    const oracle = oracleKeypair();
    const signature = nacl.sign.detached(payloadBytes, oracle.secretKey);

    if (mode === 'verified') {
      seenProofByUniq.set(uniq, Number(expiry));
    }

    const blocked = payload.dignity_score <= 20;
    console.info(
      JSON.stringify({
        event: 'shield_score_issued',
        wallet: user.toBase58(),
        nonce: payload.nonce.toString(),
        tier: mode,
        blocked,
        price_lamports: payload.initial_price.toString(),
        dignity_score: payload.dignity_score,
        user_mode: payload.user_mode,
      }),
    );

    return {
      status: 200,
      body: {
        dignity_score: dignity.totalScore,
        adapter_breakdown: dignity,
        payload: {
          policy_version: payload.policy_version,
          user_pubkey: user.toBase58(),
          initial_price: payload.initial_price.toString(),
          sales_velocity_bps: payload.sales_velocity_bps.toString(),
          time_elapsed: payload.time_elapsed.toString(),
          dignity_score: payload.dignity_score,
          adapter_mask: payload.adapter_mask,
          user_mode: payload.user_mode,
          zk_provider: payload.zk_provider,
          zk_proof_hash_hex: toHex(payload.zk_proof_hash),
          scoring_model_hash_hex: toHex(payload.scoring_model_hash),
          attestation_expiry: payload.attestation_expiry.toString(),
          nonce: payload.nonce.toString(),
        },
        payload_hex: toHex(payloadBytes),
        oracle_signature_hex: toHex(signature),
        oracle_signature_base64: Buffer.from(signature).toString('base64'),
        oracle_pubkey: oracle.publicKey.toBase58(),
        uniq_key: uniq,
        scoring_model_hash_hex: toHex(Uint8Array.from(SCORING_MODEL_HASH)),
        privacy: {
          stores_raw_credentials: false,
          stores_private_content: false,
          stores_minimal_metadata: true,
        },
      },
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'shield_score_error',
        error: error instanceof Error ? error.message : 'shield-score failed',
      }),
    );
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'shield-score failed',
        reason: 'internal_error',
      },
    };
  }
}
