#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const nacl = require('tweetnacl');
const {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require('@solana/web3.js');

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const PROGRAM_KEYPAIR_PATH =
  process.env.PROGRAM_KEYPAIR_PATH ||
  path.join(process.cwd(), 'target/deploy/unforgiven_v2-keypair.json');
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8899';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(process.env.HOME || os.homedir(), '.config/solana/id.json');
const ORACLE_KEYPAIR_PATH =
  process.env.ORACLE_KEYPAIR_PATH ||
  path.join(process.cwd(), '.keys/oracle-v2.json');
const SCORING_MODEL_V0 =
  'github>50:+40|spotify(hours>10):+30|twitter(age>365&&activity>=50):+20|guest=25|bot=0|cap=100|v0';
const SMOKE_FUND_SOL = Number(process.env.SMOKE_FUND_SOL || '0');
const SMOKE_INITIAL_PRICE_LAMPORTS = BigInt(
  process.env.SMOKE_INITIAL_PRICE_LAMPORTS || '1000000000',
);
const SMOKE_SALES_VELOCITY_BPS = BigInt(process.env.SMOKE_SALES_VELOCITY_BPS || '2500');
const SMOKE_TIME_ELAPSED = BigInt(process.env.SMOKE_TIME_ELAPSED || '12');
const SMOKE_DIGNITY_SCORE = Number(process.env.SMOKE_DIGNITY_SCORE || '92');
const SMOKE_ASK_PRICE_LAMPORTS = BigInt(
  process.env.SMOKE_ASK_PRICE_LAMPORTS || '1350000000',
);
const SMOKE_SEND_RETRIES = Number(process.env.SMOKE_SEND_RETRIES || '4');

const TICKET_MINT_AUTHORITY_SEED = Buffer.from('ticket_mint_authority_v2');
const TICKET_MINT_SEED = Buffer.from('ticket_mint_v2');
const TICKET_TOKEN_SEED = Buffer.from('ticket_token_v2');
const TICKET_RECEIPT_SEED = Buffer.from('ticket_receipt_v2');
const TICKET_LISTING_SEED = Buffer.from('ticket_listing_v2');
const TICKET_ESCROW_SEED = Buffer.from('ticket_escrow_v2');

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function deriveProgramId() {
  return loadKeypair(PROGRAM_KEYPAIR_PATH).publicKey;
}

function discriminator(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function encodeU64LE(value) {
  let next = BigInt(value);
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(next & 0xffn);
    next >>= 8n;
  }
  return out;
}

function encodeI64LE(value) {
  const normalized = BigInt.asUintN(64, BigInt(value));
  return encodeU64LE(normalized);
}

function serializePayload(payload) {
  return Buffer.concat([
    Buffer.from([payload.policy_version]),
    Buffer.from(payload.user_pubkey),
    encodeU64LE(payload.initial_price),
    encodeI64LE(payload.sales_velocity_bps),
    encodeU64LE(payload.time_elapsed),
    Buffer.from([payload.dignity_score]),
    Buffer.from([payload.adapter_mask]),
    Buffer.from([payload.user_mode]),
    Buffer.from([payload.zk_provider]),
    Buffer.from(payload.zk_proof_hash),
    Buffer.from(payload.scoring_model_hash),
    encodeI64LE(payload.attestation_expiry),
    encodeU64LE(payload.nonce),
  ]);
}

function signPayload(payloadBytes, oracle) {
  return Buffer.from(nacl.sign.detached(payloadBytes, oracle.secretKey));
}

function findPda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function findGlobalConfig(programId) {
  return findPda([Buffer.from('global_v2')], programId);
}

function findAdminConfig(programId) {
  return findPda([Buffer.from('admin_config_v2')], programId);
}

function findProofUse(programId, payloadBytes) {
  return findPda(
    [
      Buffer.from('proof_use'),
      payloadBytes.subarray(1, 33),
      payloadBytes.subarray(61, 93),
      payloadBytes.subarray(133, 141),
    ],
    programId,
  );
}

function findTicketMint(programId, payloadBytes) {
  return findPda(
    [
      TICKET_MINT_SEED,
      payloadBytes.subarray(1, 33),
      payloadBytes.subarray(61, 93),
      payloadBytes.subarray(133, 141),
    ],
    programId,
  );
}

function findTicketMintAuthority(programId) {
  return findPda([TICKET_MINT_AUTHORITY_SEED], programId);
}

function findTicketToken(programId, ticketMint, owner) {
  return findPda([TICKET_TOKEN_SEED, ticketMint.toBuffer(), owner.toBuffer()], programId);
}

function findTicketReceipt(programId, ticketMint) {
  return findPda([TICKET_RECEIPT_SEED, ticketMint.toBuffer()], programId);
}

function findListing(programId, ticketMint) {
  return findPda([TICKET_LISTING_SEED, ticketMint.toBuffer()], programId);
}

function findEscrow(programId, ticketMint) {
  return findPda([TICKET_ESCROW_SEED, ticketMint.toBuffer()], programId);
}

function computeScoringModelHash() {
  return crypto.createHash('sha256').update(SCORING_MODEL_V0).digest();
}

async function ensureAirdrop(connection, wallet, sol) {
  const signature = await connection.requestAirdrop(wallet.publicKey, sol * 1_000_000_000);
  const latest = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({
    signature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }, 'confirmed');
}

async function sendTransaction(connection, signer, instructions) {
  let lastError = null;

  for (let attempt = 1; attempt <= SMOKE_SEND_RETRIES; attempt += 1) {
    try {
      const tx = new Transaction();
      instructions.forEach((instruction) => tx.add(instruction));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = signer.publicKey;
      tx.recentBlockhash = blockhash;
      tx.sign(signer);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    } catch (error) {
      lastError = error;
      if (attempt < SMOKE_SEND_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }

  throw lastError;
}

async function fetchGlobalAuthority(connection, programId) {
  const global = findGlobalConfig(programId);
  const info = await connection.getAccountInfo(global, 'confirmed');
  if (!info || info.data.length < 41) {
    throw new Error(`global config missing at ${global.toBase58()}`);
  }
  return new PublicKey(info.data.subarray(8, 40));
}

function buildExecuteInstruction(programId, buyer, treasury, payloadBytes, oracleSignature) {
  const ticketMint = findTicketMint(programId, payloadBytes);
  return {
    ticketMint,
    ticketReceipt: findTicketReceipt(programId, ticketMint),
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
        { pubkey: findGlobalConfig(programId), isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: findAdminConfig(programId), isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: findProofUse(programId, payloadBytes), isSigner: false, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: findTicketMintAuthority(programId), isSigner: false, isWritable: false },
        { pubkey: findTicketToken(programId, ticketMint, buyer.publicKey), isSigner: false, isWritable: true },
        { pubkey: findTicketReceipt(programId, ticketMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator('execute_shield'), payloadBytes, oracleSignature]),
    }),
  };
}

function buildListInstruction(programId, seller, ticketMint, askPriceLamports) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: seller.publicKey, isSigner: true, isWritable: true },
      { pubkey: ticketMint, isSigner: false, isWritable: false },
      { pubkey: findTicketReceipt(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: findTicketToken(programId, ticketMint, seller.publicKey), isSigner: false, isWritable: true },
      { pubkey: findListing(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: findEscrow(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator('list_ticket'), encodeU64LE(askPriceLamports)]),
  });
}

function buildFillInstruction(programId, buyer, sellerPubkey, feeRecipient, ticketMint) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: sellerPubkey, isSigner: false, isWritable: true },
      { pubkey: findGlobalConfig(programId), isSigner: false, isWritable: false },
      { pubkey: feeRecipient, isSigner: false, isWritable: true },
      { pubkey: ticketMint, isSigner: false, isWritable: false },
      { pubkey: findTicketReceipt(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: findListing(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: findTicketToken(programId, ticketMint, buyer.publicKey), isSigner: false, isWritable: true },
      { pubkey: findEscrow(programId, ticketMint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminator('fill_ticket_listing')),
  });
}

async function maybeInitProtocol() {
  if (process.env.ASSUME_INIT === '1') return;
  execFileSync(process.execPath, ['scripts/init_admin_v2.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KEYPAIR_PATH,
      ORACLE_KEYPAIR_PATH,
      RPC_URL,
      NODE_NO_WARNINGS: '1',
    },
    stdio: 'inherit',
  });
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = deriveProgramId();
  const oracle = loadKeypair(ORACLE_KEYPAIR_PATH);
  const treasuryAuthority = loadKeypair(KEYPAIR_PATH);

  await maybeInitProtocol();

  const buyerOne = Keypair.generate();
  const buyerTwo = Keypair.generate();

  if (RPC_URL.includes('127.0.0.1') || RPC_URL.includes('localhost')) {
    await ensureAirdrop(connection, buyerOne, 5);
    await ensureAirdrop(connection, buyerTwo, 5);
  } else if (SMOKE_FUND_SOL > 0) {
    await sendTransaction(connection, treasuryAuthority, [
      SystemProgram.transfer({
        fromPubkey: treasuryAuthority.publicKey,
        toPubkey: buyerOne.publicKey,
        lamports: Math.round(SMOKE_FUND_SOL * 1_000_000_000),
      }),
      SystemProgram.transfer({
        fromPubkey: treasuryAuthority.publicKey,
        toPubkey: buyerTwo.publicKey,
        lamports: Math.round(SMOKE_FUND_SOL * 1_000_000_000),
      }),
    ]);
  }

  const treasury = await fetchGlobalAuthority(connection, programId);
  if (!treasury.equals(treasuryAuthority.publicKey)) {
    console.warn(`[smoke_ticket_v2] treasury authority mismatch: expected ${treasuryAuthority.publicKey.toBase58()} got ${treasury.toBase58()}`);
  }

  const payload = {
    policy_version: 0,
    user_pubkey: buyerOne.publicKey.toBytes(),
    initial_price: SMOKE_INITIAL_PRICE_LAMPORTS,
    sales_velocity_bps: SMOKE_SALES_VELOCITY_BPS,
    time_elapsed: SMOKE_TIME_ELAPSED,
    dignity_score: SMOKE_DIGNITY_SCORE,
    adapter_mask: 0b0000_0111,
    user_mode: 2,
    zk_provider: 1,
    zk_proof_hash: crypto.randomBytes(32),
    scoring_model_hash: computeScoringModelHash(),
    attestation_expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce: BigInt(Date.now()),
  };
  const payloadBytes = serializePayload(payload);
  const oracleSignature = signPayload(payloadBytes, oracle);
  const execute = buildExecuteInstruction(
    programId,
    buyerOne,
    treasury,
    payloadBytes,
    oracleSignature,
  );

  const executeSig = await sendTransaction(connection, buyerOne, [
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: payloadBytes,
      signature: oracleSignature,
    }),
    execute.ix,
  ]);

  const askPriceLamports = SMOKE_ASK_PRICE_LAMPORTS;
  const listSig = await sendTransaction(connection, buyerOne, [
    buildListInstruction(programId, buyerOne, execute.ticketMint, askPriceLamports),
  ]);

  const fillSig = await sendTransaction(connection, buyerTwo, [
    buildFillInstruction(
      programId,
      buyerTwo,
      buyerOne.publicKey,
      treasury,
      execute.ticketMint,
    ),
  ]);

  const receiptInfo = await connection.getAccountInfo(execute.ticketReceipt, 'confirmed');
  const listingInfo = await connection.getAccountInfo(findListing(programId, execute.ticketMint), 'confirmed');
  if (!receiptInfo) {
    throw new Error('ticket receipt missing after fill');
  }
  const currentHolder = new PublicKey(receiptInfo.data.subarray(104, 136));
  if (!currentHolder.equals(buyerTwo.publicKey)) {
    throw new Error(`ticket receipt holder mismatch: ${currentHolder.toBase58()}`);
  }
  if (listingInfo) {
    throw new Error('listing account still exists after fill');
  }

  console.log(JSON.stringify({
    event: 'ticket_smoke_v2_ok',
    rpc_url: RPC_URL,
    program_id: programId.toBase58(),
    execute_sig: executeSig,
    list_sig: listSig,
    fill_sig: fillSig,
    ticket_mint: execute.ticketMint.toBase58(),
    ticket_receipt: execute.ticketReceipt.toBase58(),
    first_buyer: buyerOne.publicKey.toBase58(),
    second_buyer: buyerTwo.publicKey.toBase58(),
    treasury: treasury.toBase58(),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'ticket_smoke_v2_failed',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
