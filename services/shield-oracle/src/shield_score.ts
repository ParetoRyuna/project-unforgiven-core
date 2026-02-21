import { createHash } from 'crypto';
import { keccak_256 } from '@noble/hashes/sha3';
import {
  computeDignityScore as computeDignityFromAttestations,
  SCORING_MODEL_V0,
  type AdapterBreakdown as AttestationAdapterBreakdown,
  type RawAttestation,
} from '../../dignity-scoring/src/index.ts';

export type UserMode = 'bot_suspected' | 'guest' | 'verified';
export type AdapterBreakdown = AttestationAdapterBreakdown;

export type PayloadRaw = {
  policy_version: number;
  user_pubkey: Uint8Array;
  initial_price: bigint;
  sales_velocity_bps: bigint;
  time_elapsed: bigint;
  dignity_score: number;
  adapter_mask: number;
  user_mode: number;
  zk_provider: number;
  zk_proof_hash: Uint8Array;
  scoring_model_hash: Uint8Array;
  attestation_expiry: bigint;
  nonce: bigint;
};

export const SHIELD_PAYLOAD_V0_LEN = 141;
export const DEFAULT_POLICY_VERSION = 0;
export const DEFAULT_ZK_PROVIDER = 1;
export const DEFAULT_INITIAL_PRICE = 1_000_000_000n;
export const DEFAULT_SALES_VELOCITY_BPS = 5_000n;
export const DEFAULT_TIME_ELAPSED = 12n;
export const PROOF_TTL_SECONDS = 300;

export { SCORING_MODEL_V0 };
export const SCORING_MODEL_HASH = createHash('sha256').update(SCORING_MODEL_V0).digest();

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function modeToCode(mode: UserMode): number {
  switch (mode) {
    case 'bot_suspected':
      return 0;
    case 'guest':
      return 1;
    default:
      return 2;
  }
}

export function applyUserModeToDignityScore(
  base: AdapterBreakdown,
  mode: UserMode = 'verified',
): AdapterBreakdown {
  if (mode === 'bot_suspected') {
    return {
      githubCommits: 0,
      githubPoints: 0,
      spotifyHours: 0,
      spotifyPoints: 0,
      twitterAccountAgeDays: 0,
      twitterActivityScore: 0,
      twitterPoints: 0,
      googleFallbackAgeDays: 0,
      googleFallbackPoints: 0,
      adapterMask: 0,
      totalScore: 0,
    };
  }

  if (mode === 'guest') {
    return {
      ...base,
      totalScore: Math.max(base.totalScore, 25),
    };
  }

  return base;
}

export function computeDignityScore(
  attestations: RawAttestation[] = [],
  mode: UserMode = 'verified',
): AdapterBreakdown {
  const raw = computeDignityFromAttestations(attestations);
  return applyUserModeToDignityScore(raw, mode);
}

function parseWalletFromContextString(context: unknown): string | null {
  if (typeof context !== 'string') return null;
  try {
    const parsed = JSON.parse(context) as Record<string, unknown>;
    const candidate =
      (parsed.contextAddress as string | undefined) ??
      (parsed.walletAddress as string | undefined) ??
      (parsed.owner as string | undefined);
    return candidate ?? null;
  } catch {
    return null;
  }
}

function attestationWallet(attestation: Record<string, unknown>): string | null {
  const topOwner = attestation.owner;
  if (typeof topOwner === 'string') return topOwner;

  const claim = attestation.claimData as Record<string, unknown> | undefined;
  if (!claim) return null;

  const claimOwner = claim.owner;
  if (typeof claimOwner === 'string') return claimOwner;

  return parseWalletFromContextString(claim.context);
}

export function validateAttestationWalletOwnership(
  attestations: Record<string, unknown>[],
  walletBase58: string,
): { valid: boolean; reason?: string } {
  if (attestations.length === 0) {
    return { valid: false, reason: 'no attestations provided' };
  }

  let foundWalletBinding = false;
  for (const a of attestations) {
    const owner = attestationWallet(a);
    if (!owner) continue;
    foundWalletBinding = true;
    if (owner !== walletBase58) {
      return { valid: false, reason: 'attestation wallet mismatch' };
    }
  }

  if (!foundWalletBinding) {
    return { valid: false, reason: 'attestation missing wallet binding' };
  }

  return { valid: true };
}

export function hashAttestations(attestations: Record<string, unknown>[]): Uint8Array {
  const digest = createHash('sha256').update(JSON.stringify(attestations)).digest();
  return Uint8Array.from(digest);
}

export function computeUniqKey(zkProofHash: Uint8Array, walletPubkey: Uint8Array): string {
  const joined = new Uint8Array(zkProofHash.length + walletPubkey.length);
  joined.set(zkProofHash, 0);
  joined.set(walletPubkey, zkProofHash.length);
  const digest = keccak_256(joined);
  return toHex(digest);
}

function writeU64LE(view: DataView, offset: number, value: bigint): void {
  const max = (1n << 64n) - 1n;
  if (value < 0n || value > max) {
    throw new Error('u64 out of range');
  }
  for (let i = 0; i < 8; i += 1) {
    view.setUint8(offset + i, Number((value >> BigInt(i * 8)) & 0xffn));
  }
}

function writeI64LE(view: DataView, offset: number, value: bigint): void {
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (value < min || value > max) {
    throw new Error('i64 out of range');
  }
  const encoded = value < 0n ? (1n << 64n) + value : value;
  writeU64LE(view, offset, encoded);
}

export function serializeShieldPayloadV0(payload: PayloadRaw): Uint8Array {
  if (payload.user_pubkey.length !== 32) throw new Error('user_pubkey must be 32 bytes');
  if (payload.zk_proof_hash.length !== 32) throw new Error('zk_proof_hash must be 32 bytes');
  if (payload.scoring_model_hash.length !== 32) throw new Error('scoring_model_hash must be 32 bytes');

  const out = new Uint8Array(SHIELD_PAYLOAD_V0_LEN);
  const view = new DataView(out.buffer);

  view.setUint8(0, payload.policy_version & 0xff);
  out.set(payload.user_pubkey, 1);
  writeU64LE(view, 33, payload.initial_price);
  writeI64LE(view, 41, payload.sales_velocity_bps);
  writeU64LE(view, 49, payload.time_elapsed);
  view.setUint8(57, payload.dignity_score & 0xff);
  view.setUint8(58, payload.adapter_mask & 0xff);
  view.setUint8(59, payload.user_mode & 0xff);
  view.setUint8(60, payload.zk_provider & 0xff);
  out.set(payload.zk_proof_hash, 61);
  out.set(payload.scoring_model_hash, 93);
  writeI64LE(view, 125, payload.attestation_expiry);
  writeU64LE(view, 133, payload.nonce);

  return out;
}
