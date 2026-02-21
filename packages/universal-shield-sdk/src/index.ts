import { PublicKey } from "@solana/web3.js";

const BPS_SCALE = 10_000n;
const FIXED_POINT_SCALE = 1_000_000_000n;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const BLOCK_MULTIPLIER = 100n;
const BOT_PRICE_CAP_MULTIPLIER = 120n;
const LOYALTY_THRESHOLD = 70;
const LOYALTY_POINT_DISCOUNT_BPS = 30n;
const DEFAULT_POLICY_VERSION = 0;
const DEFAULT_ZK_PROVIDER = 1;
const DEFAULT_SCORING_MODEL_HASH_HEX = "11".repeat(32);
const SHIELD_PAYLOAD_V0_LEN = 141;

export type UserMode = "bot_suspected" | "guest" | "verified";

export type AntiResalePolicy = {
  maxTicketsPerWallet: number;
  cooldownSeconds: number;
  transferLockUntil: number;
};

export type ProofPlaceholder = {
  provider: "reclaim";
  proofHashHex: string;
  schemaVersion: "v0";
  issuedAt: number;
};

export type AdapterBreakdown = {
  githubCommits: number;
  githubPoints: number;
  spotifyHours: number;
  spotifyPoints: number;
  twitterAccountAgeDays: number;
  twitterActivityScore: number;
  twitterPoints: number;
  googleFallbackAgeDays: number;
  googleFallbackPoints: number;
  adapterMask: number;
  totalScore: number;
};

export type ShieldPayloadV0 = {
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

export type ShieldQuoteInput = {
  userPubkey: string;
  initialPrice: bigint;
  salesVelocityBps: number;
  timeElapsed: bigint;
  attestations?: Record<string, unknown>[];
  mode?: UserMode;
  nonce?: bigint;
  policyVersion?: number;
  zkProvider?: number;
  scoringModelHashHex?: string;
  attestationExpiry?: bigint;
  proofPlaceholder?: Partial<ProofPlaceholder>;
  antiResalePolicy?: Partial<AntiResalePolicy>;
};

export type ShieldQuoteOutput = {
  finalPrice: bigint;
  isInfinite: boolean;
  blocked: boolean;
  effectiveVelocityBps: number;
  proof_placeholder: ProofPlaceholder;
  payload: ShieldPayloadV0;
  payloadBytes: Uint8Array;
  payloadHex: string;
  dignityBreakdown: AdapterBreakdown;
  antiResalePolicy: AntiResalePolicy;
};

export type SignedShieldRequest = {
  quote: ShieldQuoteOutput;
  oracleSignature?: Uint8Array;
  oracleSignatureHex?: string;
};

export type ExecuteShieldRequest = {
  quote: ShieldQuoteOutput;
  payload: ShieldPayloadV0;
  oracleSignature: Uint8Array;
  oracleSignatureHex: string;
};

export type OracleSigner = (payloadBytes: Uint8Array) => Promise<Uint8Array> | Uint8Array;

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function modeToCode(mode: UserMode): number {
  switch (mode) {
    case "bot_suspected":
      return 0;
    case "guest":
      return 1;
    default:
      return 2;
  }
}

function normalizeMode(mode?: UserMode): UserMode {
  return mode ?? "verified";
}

function normalizeProofPlaceholder(input?: Partial<ProofPlaceholder>): ProofPlaceholder {
  const proofHashHex = (input?.proofHashHex ?? "0".repeat(64)).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proofHashHex)) {
    throw new Error("proofHashHex must be exactly 64 hex chars");
  }

  return {
    provider: "reclaim",
    proofHashHex,
    schemaVersion: "v0",
    issuedAt: input?.issuedAt ?? Date.now(),
  };
}

function normalizeAntiResalePolicy(input?: Partial<AntiResalePolicy>): AntiResalePolicy {
  const policy: AntiResalePolicy = {
    maxTicketsPerWallet: input?.maxTicketsPerWallet ?? 1,
    cooldownSeconds: input?.cooldownSeconds ?? 86_400,
    transferLockUntil: input?.transferLockUntil ?? 0,
  };

  if (policy.maxTicketsPerWallet < 1) {
    throw new Error("maxTicketsPerWallet must be >= 1");
  }
  if (policy.cooldownSeconds < 0) {
    throw new Error("cooldownSeconds must be >= 0");
  }

  return policy;
}

function readPathNumber(input: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const segments = path.split(".");
    let cur: unknown = input;
    for (const s of segments) {
      if (cur && typeof cur === "object" && s in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[s];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "number" && Number.isFinite(cur)) return cur;
    if (typeof cur === "string") {
      const n = Number(cur);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function providerName(attestation: Record<string, unknown>): string {
  const raw =
    (attestation.provider as string | undefined) ??
    (attestation.providerName as string | undefined) ??
    ((attestation.claimData as Record<string, unknown> | undefined)?.provider as string | undefined) ??
    "";
  return raw.toLowerCase();
}

export function computeDignityScore(attestations: Record<string, unknown>[] = [], mode: UserMode = "verified"): AdapterBreakdown {
  if (mode === "bot_suspected") {
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

  let githubCommits = 0;
  let spotifyHours = 0;
  let twitterAccountAgeDays = 0;
  let twitterActivityScore = 0;
  let googleFallbackAgeDays = 0;

  for (const raw of attestations) {
    const att = raw as Record<string, unknown>;
    const provider = providerName(att);

    if (provider.includes("github")) {
      const commits = readPathNumber(att, [
        "commit_count",
        "commits",
        "data.commit_count",
        "data.commits",
        "claimData.context.commit_count",
      ]);
      githubCommits = Math.max(githubCommits, commits ?? 0);
    }

    if (provider.includes("spotify")) {
      const hours = readPathNumber(att, [
        "playtime_hours",
        "hours",
        "listening_hours",
        "data.playtime_hours",
        "data.hours",
      ]);
      spotifyHours = Math.max(spotifyHours, hours ?? 0);
    }

    if (provider.includes("twitter") || provider.includes("x.com")) {
      const ageDays = readPathNumber(att, [
        "account_age_days",
        "age_days",
        "data.account_age_days",
        "data.age_days",
      ]);
      const activity = readPathNumber(att, [
        "activity_score",
        "engagement_score",
        "data.activity_score",
      ]);
      twitterAccountAgeDays = Math.max(twitterAccountAgeDays, ageDays ?? 0);
      twitterActivityScore = Math.max(twitterActivityScore, activity ?? 0);
    }

    if (provider.includes("google")) {
      const ageDays = readPathNumber(att, [
        "account_age_days",
        "age_days",
        "data.account_age_days",
      ]);
      googleFallbackAgeDays = Math.max(googleFallbackAgeDays, ageDays ?? 0);
    }
  }

  const githubPoints = githubCommits > 50 ? 40 : 0;
  const spotifyPoints = spotifyHours > 10 ? 30 : 0;
  const twitterPoints = twitterAccountAgeDays > 365 && twitterActivityScore >= 50 ? 20 : 0;
  const googleFallbackPoints = 0;

  let totalScore = githubPoints + spotifyPoints + twitterPoints + googleFallbackPoints;
  if (mode === "guest") {
    totalScore = Math.max(totalScore, 25);
  }
  totalScore = Math.max(0, Math.min(100, totalScore));

  const adapterMask =
    (githubPoints > 0 ? 0b001 : 0) |
    (spotifyPoints > 0 ? 0b010 : 0) |
    (twitterPoints > 0 ? 0b100 : 0);

  return {
    githubCommits,
    githubPoints,
    spotifyHours,
    spotifyPoints,
    twitterAccountAgeDays,
    twitterActivityScore,
    twitterPoints,
    googleFallbackAgeDays,
    googleFallbackPoints,
    adapterMask,
    totalScore,
  };
}

function checkedMulU128(a: bigint, b: bigint): bigint | null {
  const r = a * b;
  return r > U128_MAX ? null : r;
}

function checkedDivU128(a: bigint, b: bigint): bigint | null {
  if (b === 0n) return null;
  return a / b;
}

function checkedMulDivU128(a: bigint, b: bigint, d: bigint): bigint | null {
  const mul = checkedMulU128(a, b);
  if (mul === null) return null;
  return checkedDivU128(mul, d);
}

function writeU64LE(view: DataView, offset: number, value: bigint): void {
  if (value < 0n || value > U64_MAX) {
    throw new Error("u64 out of range");
  }
  for (let i = 0; i < 8; i += 1) {
    view.setUint8(offset + i, Number((value >> BigInt(i * 8)) & 0xffn));
  }
}

function writeI64LE(view: DataView, offset: number, value: bigint): void {
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (value < min || value > max) {
    throw new Error("i64 out of range");
  }
  const encoded = value < 0n ? (1n << 64n) + value : value;
  writeU64LE(view, offset, encoded);
}

function powFixed(baseFp: bigint, exponent: bigint): bigint | null {
  let result = FIXED_POINT_SCALE;
  let base = baseFp;
  let exp = exponent;

  while (exp > 0n) {
    if ((exp & 1n) === 1n) {
      const next = checkedMulDivU128(result, base, FIXED_POINT_SCALE);
      if (next === null) return null;
      result = next;
    }

    exp >>= 1n;
    if (exp > 0n) {
      const nextBase = checkedMulDivU128(base, base, FIXED_POINT_SCALE);
      if (nextBase === null) return null;
      base = nextBase;
    }
  }

  return result;
}

function infinityOutput(
  effectiveVelocityBps: bigint,
  payload: ShieldPayloadV0,
  proof: ProofPlaceholder,
  dignityBreakdown: AdapterBreakdown,
  antiResalePolicy: AntiResalePolicy,
): ShieldQuoteOutput {
  const payloadBytes = serializeShieldPayloadV0(payload);
  return {
    finalPrice: U64_MAX,
    isInfinite: true,
    blocked: true,
    effectiveVelocityBps: Number(effectiveVelocityBps),
    proof_placeholder: proof,
    payload,
    payloadBytes,
    payloadHex: `0x${toHex(payloadBytes)}`,
    dignityBreakdown,
    antiResalePolicy,
  };
}

function calculateFromPayload(
  payload: ShieldPayloadV0,
  proof: ProofPlaceholder,
  dignityBreakdown: AdapterBreakdown,
  antiResalePolicy: AntiResalePolicy,
): ShieldQuoteOutput {
  if (payload.dignity_score < 0 || payload.dignity_score > 100) {
    throw new Error("dignity_score must be in range 0..=100");
  }
  if (payload.sales_velocity_bps <= -BPS_SCALE) {
    throw new Error("sales_velocity_bps must be greater than -10000");
  }

  const basePrice = payload.initial_price > 0n ? payload.initial_price : 1n;
  const scoreDistance = BigInt(100 - payload.dignity_score);
  const heatWeightBps = scoreDistance * scoreDistance;
  const effectiveVelocityBps = (payload.sales_velocity_bps * heatWeightBps) / BPS_SCALE;

  let expPrice = basePrice;
  if (payload.time_elapsed > 0n && effectiveVelocityBps !== 0n) {
    const growthNumerator = BPS_SCALE + effectiveVelocityBps;
    if (growthNumerator <= 0n) {
      expPrice = 1n;
    } else {
      const perStepGrowth = checkedMulDivU128(growthNumerator, FIXED_POINT_SCALE, BPS_SCALE);
      if (perStepGrowth === null) {
        return infinityOutput(effectiveVelocityBps, payload, proof, dignityBreakdown, antiResalePolicy);
      }
      const growthFactor = powFixed(perStepGrowth, payload.time_elapsed);
      if (growthFactor === null) {
        return infinityOutput(effectiveVelocityBps, payload, proof, dignityBreakdown, antiResalePolicy);
      }
      const priced = checkedMulDivU128(basePrice, growthFactor, FIXED_POINT_SCALE);
      if (priced === null) {
        return infinityOutput(effectiveVelocityBps, payload, proof, dignityBreakdown, antiResalePolicy);
      }
      expPrice = priced > 0n ? priced : 1n;
    }
  }

  const loyaltyPenalty = BigInt(Math.max(0, payload.dignity_score - LOYALTY_THRESHOLD)) * LOYALTY_POINT_DISCOUNT_BPS;
  const loyaltyDiscountBps = loyaltyPenalty > BPS_SCALE ? 0n : BPS_SCALE - loyaltyPenalty;
  const final = checkedMulDivU128(expPrice, loyaltyDiscountBps, BPS_SCALE);
  if (final === null || final > U64_MAX) {
    return infinityOutput(effectiveVelocityBps, payload, proof, dignityBreakdown, antiResalePolicy);
  }

  const botCapPrice = basePrice * BOT_PRICE_CAP_MULTIPLIER;
  const finalPrice = (final > 0n ? final : 1n) > botCapPrice ? botCapPrice : (final > 0n ? final : 1n);
  const blocked = finalPrice >= basePrice * BLOCK_MULTIPLIER;
  const payloadBytes = serializeShieldPayloadV0(payload);

  return {
    finalPrice,
    isInfinite: false,
    blocked,
    effectiveVelocityBps: Number(effectiveVelocityBps),
    proof_placeholder: proof,
    payload,
    payloadBytes,
    payloadHex: `0x${toHex(payloadBytes)}`,
    dignityBreakdown,
    antiResalePolicy,
  };
}

export function buildShieldPayloadV0(input: ShieldQuoteInput): {
  payload: ShieldPayloadV0;
  proof: ProofPlaceholder;
  dignityBreakdown: AdapterBreakdown;
  antiResalePolicy: AntiResalePolicy;
} {
  assertSafeInteger(input.salesVelocityBps, "salesVelocityBps");
  if (input.initialPrice < 0n) {
    throw new Error("initialPrice must be >= 0");
  }
  if (input.timeElapsed < 0n) {
    throw new Error("timeElapsed must be >= 0");
  }

  const mode = normalizeMode(input.mode);
  const proof = normalizeProofPlaceholder(input.proofPlaceholder);
  const dignityBreakdown = computeDignityScore(input.attestations ?? [], mode);
  const antiResalePolicy = normalizeAntiResalePolicy(input.antiResalePolicy);

  const policyVersion = input.policyVersion ?? DEFAULT_POLICY_VERSION;
  const zkProvider = input.zkProvider ?? DEFAULT_ZK_PROVIDER;
  assertSafeInteger(policyVersion, "policyVersion");
  assertSafeInteger(zkProvider, "zkProvider");

  if (policyVersion < 0 || policyVersion > 255) {
    throw new Error("policyVersion must be in range 0..255");
  }
  if (zkProvider < 0 || zkProvider > 255) {
    throw new Error("zkProvider must be in range 0..255");
  }

  const userPubkey = new PublicKey(input.userPubkey).toBytes();
  const scoringModelHashHex = (input.scoringModelHashHex ?? DEFAULT_SCORING_MODEL_HASH_HEX).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(scoringModelHashHex)) {
    throw new Error("scoringModelHashHex must be exactly 64 hex chars");
  }

  const payload: ShieldPayloadV0 = {
    policy_version: policyVersion,
    user_pubkey: Uint8Array.from(userPubkey),
    initial_price: input.initialPrice,
    sales_velocity_bps: BigInt(input.salesVelocityBps),
    time_elapsed: input.timeElapsed,
    dignity_score: dignityBreakdown.totalScore,
    adapter_mask: dignityBreakdown.adapterMask,
    user_mode: modeToCode(mode),
    zk_provider: zkProvider,
    zk_proof_hash: fromHex(proof.proofHashHex),
    scoring_model_hash: fromHex(scoringModelHashHex),
    attestation_expiry: input.attestationExpiry ?? BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce: input.nonce ?? BigInt(Date.now()) * 1_000n,
  };

  return { payload, proof, dignityBreakdown, antiResalePolicy };
}

export function serializeShieldPayloadV0(payload: ShieldPayloadV0): Uint8Array {
  if (payload.user_pubkey.length !== 32) {
    throw new Error("user_pubkey must be 32 bytes");
  }
  if (payload.zk_proof_hash.length !== 32) {
    throw new Error("zk_proof_hash must be 32 bytes");
  }
  if (payload.scoring_model_hash.length !== 32) {
    throw new Error("scoring_model_hash must be 32 bytes");
  }

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

export function calculateShieldQuote(input: ShieldQuoteInput): ShieldQuoteOutput {
  const { payload, proof, dignityBreakdown, antiResalePolicy } = buildShieldPayloadV0(input);
  return calculateFromPayload(payload, proof, dignityBreakdown, antiResalePolicy);
}

export function activateUniversalShield(input: ShieldQuoteInput): ShieldQuoteOutput {
  return calculateShieldQuote(input);
}

export async function buildSignedShieldRequest(
  input: ShieldQuoteInput,
  oracleSigner?: OracleSigner,
): Promise<SignedShieldRequest> {
  const quote = calculateShieldQuote(input);
  if (!oracleSigner) {
    return { quote };
  }

  const signature = await oracleSigner(quote.payloadBytes);
  if (signature.length !== 64) {
    throw new Error("oracle signature must be 64 bytes");
  }

  return {
    quote,
    oracleSignature: Uint8Array.from(signature),
    oracleSignatureHex: `0x${toHex(signature)}`,
  };
}

export async function buildExecuteShieldRequest(
  input: ShieldQuoteInput,
  oracleSigner: OracleSigner,
): Promise<ExecuteShieldRequest> {
  const signed = await buildSignedShieldRequest(input, oracleSigner);
  if (!signed.oracleSignature || !signed.oracleSignatureHex) {
    throw new Error("oracleSigner is required for execute request");
  }
  if (signed.quote.blocked || signed.quote.isInfinite) {
    throw new Error("shield blocked this payload; execute request denied");
  }

  return {
    quote: signed.quote,
    payload: signed.quote.payload,
    oracleSignature: signed.oracleSignature,
    oracleSignatureHex: signed.oracleSignatureHex,
  };
}

export * from "./hide_sis_types.ts";
