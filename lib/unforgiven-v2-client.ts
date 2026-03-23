import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import {
  Connection,
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';

export type ShieldMode = 'bot_suspected' | 'guest' | 'verified';

export type ShieldScoreApiResponse = {
  dignity_score: number;
  adapter_breakdown?: {
    adapterMask?: number;
    totalScore?: number;
  };
  payload: {
    initial_price: string;
    sales_velocity_bps: string;
    time_elapsed: string;
    dignity_score: number;
    adapter_mask: number;
    user_mode: number;
    zk_proof_hash_hex: string;
    scoring_model_hash_hex: string;
    attestation_expiry: string;
    nonce: string;
  };
  payload_hex: string;
  oracle_signature_hex: string;
  oracle_pubkey: string;
  scoring_model_hash_hex: string;
};

export type ShieldQuote = {
  mode: ShieldMode;
  dignityScore: number;
  adapterMask: number;
  initialPriceLamports: bigint;
  finalPriceLamports: bigint;
  surchargeLamports: bigint;
  blocked: boolean;
  isInfinite: boolean;
  effectiveVelocityBps: bigint;
  salesVelocityBps: bigint;
  timeElapsedSecs: bigint;
  attestationExpiry: bigint;
  oraclePubkey: string;
  payloadHex: string;
  oracleSignatureHex: string;
  scoringModelHashHex: string;
  nonce: bigint;
};

export type GlobalConfigSnapshot = {
  authority: PublicKey;
  bump: number;
};

export type ProtocolState = {
  globalConfigExists: boolean;
  adminConfigExists: boolean;
  globalAuthority: PublicKey | null;
};

export type AdminConfigSnapshot = {
  authority: PublicKey;
  oraclePubkey: Uint8Array;
  activeScoringModelHash: Uint8Array;
  bump: number;
};

export type ShieldExecutionEvent = {
  finalPriceLamports: bigint;
  blocked: boolean;
  effectiveVelocityBps: bigint;
  dignityScore: number;
  adapterMask: number;
  userMode: number;
  nonce: bigint;
  zkProofHashHex: string;
};

export type TicketReceiptSnapshot = {
  address: PublicKey;
  mint: PublicKey;
  eventKey: PublicKey;
  originalBuyer: PublicKey;
  currentHolder: PublicKey;
  purchasePriceLamports: bigint;
  lastSalePriceLamports: bigint;
  issuedAt: bigint;
  lastTransferAt: bigint;
  nonce: bigint;
  zkProofHashHex: string;
  listed: boolean;
  resaleCount: bigint;
  bump: number;
};

export type TicketListingSnapshot = {
  address: PublicKey;
  seller: PublicKey;
  mint: PublicKey;
  askPriceLamports: bigint;
  createdAt: bigint;
  bump: number;
};

export type OwnedTicketView = TicketReceiptSnapshot & {
  listing: TicketListingSnapshot | null;
};

const BPS_SCALE = 10_000n;
const FIXED_POINT_SCALE = 1_000_000_000n;
const LOYALTY_BASE_BPS = 10_000n;
const LOYALTY_THRESHOLD = 70;
const LOYALTY_POINT_DISCOUNT_BPS = 30n;
const BLOCK_MULTIPLIER = 100n;
const BOT_PRICE_CAP_MULTIPLIER = 120n;
const MAX_TIME_ELAPSED_SECS = 30n * 24n * 60n * 60n;
const EXECUTION_EVENT_NAME = 'ShieldExecutionEvent';
const GLOBAL_NAMESPACE = 'global';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TICKET_MINT_AUTHORITY_SEED = utf8ToBytes('ticket_mint_authority_v2');
const TICKET_MINT_SEED = utf8ToBytes('ticket_mint_v2');
const TICKET_TOKEN_SEED = utf8ToBytes('ticket_token_v2');
const TICKET_RECEIPT_SEED = utf8ToBytes('ticket_receipt_v2');
const TICKET_LISTING_SEED = utf8ToBytes('ticket_listing_v2');
const TICKET_ESCROW_SEED = utf8ToBytes('ticket_escrow_v2');

function boolFromByte(bytes: Uint8Array, offset: number): boolean {
  return bytes[offset] !== 0;
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(bytes[offset + i] ?? 0) << (8n * BigInt(i));
  }
  return value;
}

function readI64LE(bytes: Uint8Array, offset: number): bigint {
  const value = readU64LE(bytes, offset);
  const signBit = 1n << 63n;
  return value >= signBit ? value - (1n << 64n) : value;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function powFixed(baseFp: bigint, exponent: bigint): bigint {
  let resultFp = FIXED_POINT_SCALE;
  let base = baseFp;
  let exp = exponent;

  while (exp > 0n) {
    if ((exp & 1n) === 1n) {
      resultFp = (resultFp * base) / FIXED_POINT_SCALE;
    }
    exp >>= 1n;
    if (exp > 0n) {
      base = (base * base) / FIXED_POINT_SCALE;
    }
  }

  return resultFp;
}

function computeExponentialPrice(
  basePrice: bigint,
  velocityBps: bigint,
  timeElapsed: bigint,
): bigint {
  if (timeElapsed === 0n || velocityBps === 0n) {
    return basePrice > 0n ? basePrice : 1n;
  }

  const growthNumerator = BPS_SCALE + velocityBps;
  if (growthNumerator <= 0n) {
    return 1n;
  }

  const perStepGrowthFp = (growthNumerator * FIXED_POINT_SCALE) / BPS_SCALE;
  const growthFactorFp = powFixed(perStepGrowthFp, timeElapsed);
  const price = (basePrice * growthFactorFp) / FIXED_POINT_SCALE;
  return price > 0n ? price : 1n;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('invalid hex length');
  }
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export function solToLamports(value: number): bigint {
  return BigInt(Math.round(value * 1_000_000_000));
}

export function normalizeSignedProofPayload(proof: unknown): Record<string, unknown>[] {
  if (!proof) return [];
  const proofs = Array.isArray(proof) ? proof : [proof];
  return proofs.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const signatures = (item as { signatures?: unknown }).signatures;
    return Array.isArray(signatures) && signatures.length > 0;
  }) as Record<string, unknown>[];
}

export function anchorDiscriminator(namespace: string, name: string): Uint8Array {
  return sha256(utf8ToBytes(`${namespace}:${name}`)).slice(0, 8);
}

export function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
  )[0];
}

export function findGlobalConfigV2Pda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([utf8ToBytes('global_v2')], programId)[0];
}

export function findAdminConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([utf8ToBytes('admin_config_v2')], programId)[0];
}

export function findProofUsePda(programId: PublicKey, payloadBytes: Uint8Array): PublicKey {
  if (payloadBytes.length !== 141) {
    throw new Error(`payload length mismatch: expected 141, got ${payloadBytes.length}`);
  }

  return PublicKey.findProgramAddressSync(
    [
      utf8ToBytes('proof_use'),
      payloadBytes.slice(1, 33),
      payloadBytes.slice(61, 93),
      payloadBytes.slice(133, 141),
    ],
    programId,
  )[0];
}

export function findTicketMintAuthorityPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([TICKET_MINT_AUTHORITY_SEED], programId)[0];
}

export function findTicketMintPda(programId: PublicKey, payloadBytes: Uint8Array): PublicKey {
  if (payloadBytes.length !== 141) {
    throw new Error(`payload length mismatch: expected 141, got ${payloadBytes.length}`);
  }

  return PublicKey.findProgramAddressSync(
    [
      TICKET_MINT_SEED,
      payloadBytes.slice(1, 33),
      payloadBytes.slice(61, 93),
      payloadBytes.slice(133, 141),
    ],
    programId,
  )[0];
}

export function findTicketTokenPda(
  programId: PublicKey,
  ticketMint: PublicKey,
  owner: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TICKET_TOKEN_SEED, ticketMint.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
}

export function findTicketReceiptPda(programId: PublicKey, ticketMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([TICKET_RECEIPT_SEED, ticketMint.toBuffer()], programId)[0];
}

export function findTicketListingPda(programId: PublicKey, ticketMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([TICKET_LISTING_SEED, ticketMint.toBuffer()], programId)[0];
}

export function findTicketEscrowPda(programId: PublicKey, ticketMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([TICKET_ESCROW_SEED, ticketMint.toBuffer()], programId)[0];
}

export function calculateShieldQuote(input: {
  initialPriceLamports: bigint;
  salesVelocityBps: bigint;
  timeElapsedSecs: bigint;
  dignityScore: number;
}): Pick<
  ShieldQuote,
  'finalPriceLamports' | 'surchargeLamports' | 'blocked' | 'isInfinite' | 'effectiveVelocityBps'
> {
  if (input.dignityScore < 0 || input.dignityScore > 100) {
    throw new Error(`invalid dignity score: ${input.dignityScore}`);
  }
  if (input.salesVelocityBps <= -BPS_SCALE) {
    throw new Error(`invalid sales velocity: ${input.salesVelocityBps.toString()}`);
  }
  if (input.timeElapsedSecs < 0n || input.timeElapsedSecs > MAX_TIME_ELAPSED_SECS) {
    throw new Error(`invalid time elapsed: ${input.timeElapsedSecs.toString()}`);
  }

  const basePrice = input.initialPriceLamports > 0n ? input.initialPriceLamports : 1n;
  const scoreDistance = BigInt(100 - input.dignityScore);
  const heatWeightBps = scoreDistance * scoreDistance;
  const effectiveVelocityBps = (input.salesVelocityBps * heatWeightBps) / BPS_SCALE;

  const expPrice = computeExponentialPrice(
    basePrice,
    effectiveVelocityBps,
    input.timeElapsedSecs,
  );

  const loyaltyDiscountBps = LOYALTY_BASE_BPS -
    BigInt(Math.max(0, input.dignityScore - LOYALTY_THRESHOLD)) * LOYALTY_POINT_DISCOUNT_BPS;
  const discountedPrice = ((expPrice * (loyaltyDiscountBps > 0n ? loyaltyDiscountBps : 0n)) /
    LOYALTY_BASE_BPS) || 1n;

  const cappedPrice = discountedPrice > basePrice * BOT_PRICE_CAP_MULTIPLIER
    ? basePrice * BOT_PRICE_CAP_MULTIPLIER
    : discountedPrice;

  const blocked = cappedPrice >= basePrice * BLOCK_MULTIPLIER;
  return {
    finalPriceLamports: cappedPrice,
    surchargeLamports: cappedPrice > basePrice ? cappedPrice - basePrice : 0n,
    blocked,
    isInfinite: false,
    effectiveVelocityBps,
  };
}

export function shieldQuoteFromApiResponse(
  response: ShieldScoreApiResponse,
  mode: ShieldMode,
): ShieldQuote {
  const initialPriceLamports = BigInt(response.payload.initial_price);
  const salesVelocityBps = BigInt(response.payload.sales_velocity_bps);
  const timeElapsedSecs = BigInt(response.payload.time_elapsed);
  const dignityScore = response.payload.dignity_score;
  const quote = calculateShieldQuote({
    initialPriceLamports,
    salesVelocityBps,
    timeElapsedSecs,
    dignityScore,
  });

  return {
    mode,
    dignityScore,
    adapterMask: response.payload.adapter_mask,
    initialPriceLamports,
    finalPriceLamports: quote.finalPriceLamports,
    surchargeLamports: quote.surchargeLamports,
    blocked: quote.blocked,
    isInfinite: quote.isInfinite,
    effectiveVelocityBps: quote.effectiveVelocityBps,
    salesVelocityBps,
    timeElapsedSecs,
    attestationExpiry: BigInt(response.payload.attestation_expiry),
    oraclePubkey: response.oracle_pubkey,
    payloadHex: response.payload_hex,
    oracleSignatureHex: response.oracle_signature_hex,
    scoringModelHashHex: response.scoring_model_hash_hex,
    nonce: BigInt(response.payload.nonce),
  };
}

export function parseGlobalConfigAccount(data: Uint8Array): GlobalConfigSnapshot | null {
  if (!data || data.length < 41) return null;
  return {
    authority: new PublicKey(data.slice(8, 40)),
    bump: data[40] ?? 0,
  };
}

export function parseAdminConfigAccount(data: Uint8Array): AdminConfigSnapshot | null {
  if (!data || data.length < 105) return null;
  return {
    authority: new PublicKey(data.slice(8, 40)),
    oraclePubkey: data.slice(40, 72),
    activeScoringModelHash: data.slice(72, 104),
    bump: data[104] ?? 0,
  };
}

export function parseTicketReceiptAccount(
  address: PublicKey,
  data: Uint8Array,
): TicketReceiptSnapshot | null {
  if (!data || data.length < 218) return null;
  return {
    address,
    mint: new PublicKey(data.slice(8, 40)),
    eventKey: new PublicKey(data.slice(40, 72)),
    originalBuyer: new PublicKey(data.slice(72, 104)),
    currentHolder: new PublicKey(data.slice(104, 136)),
    purchasePriceLamports: readU64LE(data, 136),
    lastSalePriceLamports: readU64LE(data, 144),
    issuedAt: readI64LE(data, 152),
    lastTransferAt: readI64LE(data, 160),
    nonce: readU64LE(data, 168),
    zkProofHashHex: bytesToHex(data.slice(176, 208)),
    listed: boolFromByte(data, 208),
    resaleCount: readU64LE(data, 209),
    bump: data[217] ?? 0,
  };
}

export function parseTicketListingAccount(
  address: PublicKey,
  data: Uint8Array,
): TicketListingSnapshot | null {
  if (!data || data.length < 89) return null;
  return {
    address,
    seller: new PublicKey(data.slice(8, 40)),
    mint: new PublicKey(data.slice(40, 72)),
    askPriceLamports: readU64LE(data, 72),
    createdAt: readI64LE(data, 80),
    bump: data[88] ?? 0,
  };
}

function hasAccountDiscriminator(data: Uint8Array, name: string): boolean {
  const expected = anchorDiscriminator('account', name);
  return expected.every((value, index) => data[index] === value);
}

export async function fetchProtocolState(
  connection: Pick<Connection, 'getAccountInfo'>,
  programId: PublicKey,
): Promise<ProtocolState> {
  const [globalInfo, adminInfo] = await Promise.all([
    connection.getAccountInfo(findGlobalConfigV2Pda(programId)),
    connection.getAccountInfo(findAdminConfigPda(programId)),
  ]);

  const globalConfig = globalInfo ? parseGlobalConfigAccount(globalInfo.data) : null;
  return {
    globalConfigExists: !!globalInfo,
    adminConfigExists: !!adminInfo,
    globalAuthority: globalConfig?.authority ?? null,
  };
}

export function buildPreviewInstructionData(
  payloadBytes: Uint8Array,
  oracleSignatureBytes: Uint8Array,
): Buffer {
  return Buffer.from(
    concatBytes(
      anchorDiscriminator(GLOBAL_NAMESPACE, 'preview_price'),
      payloadBytes,
      oracleSignatureBytes,
    ),
  );
}

const EXECUTE_SHIELD_PAYLOAD_LEN = 141;
const ORACLE_SIGNATURE_LEN = 64;

export function buildExecuteInstructionData(
  payloadBytes: Uint8Array,
  oracleSignatureBytes: Uint8Array,
): Buffer {
  if (payloadBytes.length !== EXECUTE_SHIELD_PAYLOAD_LEN) {
    throw new Error(
      `execute_shield payload must be ${EXECUTE_SHIELD_PAYLOAD_LEN} bytes, got ${payloadBytes.length}`,
    );
  }
  if (oracleSignatureBytes.length !== ORACLE_SIGNATURE_LEN) {
    throw new Error(
      `oracle_signature must be ${ORACLE_SIGNATURE_LEN} bytes, got ${oracleSignatureBytes.length}`,
    );
  }
  return Buffer.from(
    concatBytes(
      anchorDiscriminator(GLOBAL_NAMESPACE, 'execute_shield'),
      payloadBytes,
      oracleSignatureBytes,
    ),
  );
}

function encodeU64LE(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let input = value;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(input & 0xffn);
    input >>= 8n;
  }
  return out;
}

export function buildExecuteInstructions(input: {
  programId: PublicKey;
  userPubkey: PublicKey;
  treasuryPubkey: PublicKey;
  payloadBytes: Uint8Array;
  oracleSignatureBytes: Uint8Array;
  oraclePubkeyBytes: Uint8Array;
}): {
  ed25519Ix: TransactionInstruction;
  executeIx: TransactionInstruction;
  ticketMintPda: PublicKey;
  ticketReceiptPda: PublicKey;
} {
  const adminConfigPda = findAdminConfigPda(input.programId);
  const globalConfigPda = findGlobalConfigV2Pda(input.programId);
  const proofUsePda = findProofUsePda(input.programId, input.payloadBytes);
  const ticketMintPda = findTicketMintPda(input.programId, input.payloadBytes);
  const ticketMintAuthorityPda = findTicketMintAuthorityPda(input.programId);
  const userTicketTokenPda = findTicketTokenPda(input.programId, ticketMintPda, input.userPubkey);
  const ticketReceiptPda = findTicketReceiptPda(input.programId, ticketMintPda);

  return {
    ed25519Ix: Ed25519Program.createInstructionWithPublicKey({
      publicKey: input.oraclePubkeyBytes,
      message: input.payloadBytes,
      signature: input.oracleSignatureBytes,
    }),
    executeIx: new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: input.userPubkey, isSigner: true, isWritable: true },
        { pubkey: globalConfigPda, isSigner: false, isWritable: false },
        { pubkey: input.treasuryPubkey, isSigner: false, isWritable: true },
        { pubkey: adminConfigPda, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: proofUsePda, isSigner: false, isWritable: true },
        { pubkey: ticketMintPda, isSigner: false, isWritable: true },
        { pubkey: ticketMintAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: userTicketTokenPda, isSigner: false, isWritable: true },
        { pubkey: ticketReceiptPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: buildExecuteInstructionData(input.payloadBytes, input.oracleSignatureBytes),
    }),
    ticketMintPda,
    ticketReceiptPda,
  };
}

export function buildListTicketInstruction(input: {
  programId: PublicKey;
  sellerPubkey: PublicKey;
  ticketMint: PublicKey;
  askPriceLamports: bigint;
}): { listIx: TransactionInstruction; listingPda: PublicKey } {
  const ticketReceiptPda = findTicketReceiptPda(input.programId, input.ticketMint);
  const sellerTicketTokenPda = findTicketTokenPda(input.programId, input.ticketMint, input.sellerPubkey);
  const listingPda = findTicketListingPda(input.programId, input.ticketMint);
  const listingEscrowPda = findTicketEscrowPda(input.programId, input.ticketMint);

  return {
    listingPda,
    listIx: new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: input.sellerPubkey, isSigner: true, isWritable: true },
        { pubkey: input.ticketMint, isSigner: false, isWritable: false },
        { pubkey: ticketReceiptPda, isSigner: false, isWritable: true },
        { pubkey: sellerTicketTokenPda, isSigner: false, isWritable: true },
        { pubkey: listingPda, isSigner: false, isWritable: true },
        { pubkey: listingEscrowPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
          anchorDiscriminator(GLOBAL_NAMESPACE, 'list_ticket'),
          encodeU64LE(input.askPriceLamports),
        ),
      ),
    }),
  };
}

export function buildCancelTicketListingInstruction(input: {
  programId: PublicKey;
  sellerPubkey: PublicKey;
  ticketMint: PublicKey;
}): TransactionInstruction {
  const ticketReceiptPda = findTicketReceiptPda(input.programId, input.ticketMint);
  const listingPda = findTicketListingPda(input.programId, input.ticketMint);
  const sellerTicketTokenPda = findTicketTokenPda(input.programId, input.ticketMint, input.sellerPubkey);
  const listingEscrowPda = findTicketEscrowPda(input.programId, input.ticketMint);

  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: input.ticketMint, isSigner: false, isWritable: false },
      { pubkey: ticketReceiptPda, isSigner: false, isWritable: true },
      { pubkey: listingPda, isSigner: false, isWritable: true },
      { pubkey: sellerTicketTokenPda, isSigner: false, isWritable: true },
      { pubkey: listingEscrowPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(anchorDiscriminator(GLOBAL_NAMESPACE, 'cancel_ticket_listing')),
  });
}

export function buildFillTicketListingInstruction(input: {
  programId: PublicKey;
  buyerPubkey: PublicKey;
  sellerPubkey: PublicKey;
  feeRecipientPubkey: PublicKey;
  ticketMint: PublicKey;
}): TransactionInstruction {
  const globalConfigPda = findGlobalConfigV2Pda(input.programId);
  const ticketReceiptPda = findTicketReceiptPda(input.programId, input.ticketMint);
  const listingPda = findTicketListingPda(input.programId, input.ticketMint);
  const buyerTicketTokenPda = findTicketTokenPda(input.programId, input.ticketMint, input.buyerPubkey);
  const listingEscrowPda = findTicketEscrowPda(input.programId, input.ticketMint);

  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: input.sellerPubkey, isSigner: false, isWritable: true },
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },
      { pubkey: input.feeRecipientPubkey, isSigner: false, isWritable: true },
      { pubkey: input.ticketMint, isSigner: false, isWritable: false },
      { pubkey: ticketReceiptPda, isSigner: false, isWritable: true },
      { pubkey: listingPda, isSigner: false, isWritable: true },
      { pubkey: buyerTicketTokenPda, isSigner: false, isWritable: true },
      { pubkey: listingEscrowPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(anchorDiscriminator(GLOBAL_NAMESPACE, 'fill_ticket_listing')),
  });
}

export async function fetchOwnedTickets(
  connection: Connection,
  programId: PublicKey,
  owner: PublicKey,
): Promise<OwnedTicketView[]> {
  const programAccounts = await connection.getProgramAccounts(programId);
  const receipts = programAccounts
    .filter((item) => hasAccountDiscriminator(item.account.data, 'TicketReceipt'))
    .map((item) => parseTicketReceiptAccount(item.pubkey, item.account.data))
    .filter((item): item is TicketReceiptSnapshot => !!item)
    .filter((item) => item.currentHolder.equals(owner));

  const listings = await Promise.all(
    receipts.map(async (receipt) => {
      const listingPda = findTicketListingPda(programId, receipt.mint);
      const info = await connection.getAccountInfo(listingPda);
      if (!info || !hasAccountDiscriminator(info.data, 'TicketListing')) return null;
      return parseTicketListingAccount(listingPda, info.data);
    }),
  );

  return receipts
    .map((receipt, index) => ({
      ...receipt,
      listing: listings[index] ?? null,
    }))
    .sort((left, right) => Number(right.issuedAt - left.issuedAt));
}

export async function fetchActiveListings(
  connection: Connection,
  programId: PublicKey,
): Promise<TicketListingSnapshot[]> {
  const programAccounts = await connection.getProgramAccounts(programId);
  return programAccounts
    .filter((item) => hasAccountDiscriminator(item.account.data, 'TicketListing'))
    .map((item) => parseTicketListingAccount(item.pubkey, item.account.data))
    .filter((item): item is TicketListingSnapshot => !!item)
    .sort((left, right) => Number(right.createdAt - left.createdAt));
}

export function parseExecutionEventFromLogs(
  logMessages: string[] | null | undefined,
): ShieldExecutionEvent | null {
  const eventDisc = anchorDiscriminator('event', EXECUTION_EVENT_NAME);
  for (const line of logMessages || []) {
    const prefix = 'Program data: ';
    if (!line.startsWith(prefix)) continue;
    const raw = Uint8Array.from(Buffer.from(line.slice(prefix.length), 'base64'));
    if (raw.length < 68) continue;
    if (!raw.slice(0, 8).every((value, index) => value === eventDisc[index])) continue;

    return {
      finalPriceLamports: readU64LE(raw, 8),
      blocked: boolFromByte(raw, 16),
      effectiveVelocityBps: readI64LE(raw, 17),
      dignityScore: raw[25] ?? 0,
      adapterMask: raw[26] ?? 0,
      userMode: raw[27] ?? 0,
      nonce: readU64LE(raw, 28),
      zkProofHashHex: bytesToHex(raw.slice(36, 68)),
    };
  }
  return null;
}

export { TOKEN_PROGRAM_ID };
