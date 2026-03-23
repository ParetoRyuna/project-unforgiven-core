#!/usr/bin/env node

if (process.env.SHOW_NODE_DEPRECATION !== '1') {
  process.noDeprecation = true;
}

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { deriveProgramDataAddress } = require('./solana_program_ids');
const { discriminator, findAdminConfigPda } = require('./tx_builder_v2');

const SCORING_MODEL_V0 =
  'github>50:+40|spotify(hours>10):+30|twitter(age>365&&activity>=50):+20|guest=25|bot=0|cap=100|v0';

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('expected a 32-byte hex string');
  }
  return Buffer.from(clean, 'hex');
}

function normalizeOracleBytes(value) {
  return Buffer.from(new PublicKey(value).toBytes());
}

function deriveScoringModelHash() {
  return crypto.createHash('sha256').update(SCORING_MODEL_V0).digest();
}

function buildIx(programId, keys, data) {
  return new TransactionInstruction({ programId, keys, data });
}

async function sendInstructions(connection, payer, instructions) {
  const tx = new Transaction();
  for (const instruction of instructions) tx.add(instruction);
  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

function parseAdminConfigAccount(data) {
  if (!data || data.length < 105) return null;
  return {
    authority: new PublicKey(data.subarray(8, 40)),
    oraclePubkey: Buffer.from(data.subarray(40, 72)),
    activeScoringModelHash: Buffer.from(data.subarray(72, 104)),
    bump: data[104],
  };
}

async function fetchRuntimeConfigFromApi(apiBase) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/shield-config`);
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`shield-config returned non-JSON: ${raw.slice(0, 160)}`);
  }
  if (!res.ok || !body.oraclePubkey || !body.scoringModelHashHex) {
    throw new Error(body.error || `shield-config failed (${res.status})`);
  }
  return {
    oraclePubkey: body.oraclePubkey,
    scoringModelHashHex: body.scoringModelHashHex,
  };
}

async function resolveRuntimeConfig() {
  const apiBase = process.env.SHIELD_API_BASE;
  if (apiBase) {
    return fetchRuntimeConfigFromApi(apiBase);
  }

  const oraclePubkey =
    process.env.ORACLE_PUBLIC_KEY ||
    (process.env.ORACLE_KEYPAIR_PATH
      ? new PublicKey(loadKeypair(process.env.ORACLE_KEYPAIR_PATH).publicKey).toBase58()
      : process.env.ORACLE_PRIVATE_KEY
        ? loadKeypairFromInline(process.env.ORACLE_PRIVATE_KEY).publicKey.toBase58()
        : null);

  if (!oraclePubkey) {
    throw new Error(
      'Missing oracle config. Set SHIELD_API_BASE, ORACLE_PUBLIC_KEY, ORACLE_KEYPAIR_PATH, or ORACLE_PRIVATE_KEY.',
    );
  }

  return {
    oraclePubkey,
    scoringModelHashHex:
      process.env.SCORING_MODEL_HASH_HEX ||
      process.env.BASELINE_SCORING_MODEL_HASH_HEX ||
      deriveScoringModelHash().toString('hex'),
  };
}

function loadKeypairFromInline(raw) {
  const parsed = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const keypairPath =
    process.env.KEYPAIR_PATH || path.join(process.env.HOME, '.config/solana/id.json');
  const programKeypairPath =
    process.env.PROGRAM_KEYPAIR_PATH ||
    path.join(process.cwd(), 'target/deploy/unforgiven_v2-keypair.json');

  const wallet = loadKeypair(keypairPath);
  const programKp = loadKeypair(programKeypairPath);
  const programId = programKp.publicKey;
  const connection = new Connection(rpcUrl, 'confirmed');
  const programData = deriveProgramDataAddress(programId);
  const globalConfigV2 = PublicKey.findProgramAddressSync(
    [Buffer.from('global_v2')],
    programId,
  )[0];
  const adminConfig = findAdminConfigPda(programId);

  const runtimeConfig = await resolveRuntimeConfig();
  const oraclePubkeyBytes = normalizeOracleBytes(runtimeConfig.oraclePubkey);
  const scoringModelHashBytes = hexToBytes(runtimeConfig.scoringModelHashHex);

  console.log(`wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`program: ${programId.toBase58()}`);
  console.log(`rpc: ${rpcUrl}`);
  console.log(`global_config_v2: ${globalConfigV2.toBase58()}`);
  console.log(`admin_config: ${adminConfig.toBase58()}`);
  console.log(`oracle_pubkey: ${runtimeConfig.oraclePubkey}`);
  console.log(`scoring_model_hash_hex: ${runtimeConfig.scoringModelHashHex}`);

  const [globalInfo, adminInfo] = await Promise.all([
    connection.getAccountInfo(globalConfigV2, 'confirmed'),
    connection.getAccountInfo(adminConfig, 'confirmed'),
  ]);

  if (!globalInfo) {
    const initGlobalIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: programId, isSigner: false, isWritable: false },
        { pubkey: programData, isSigner: false, isWritable: false },
        { pubkey: globalConfigV2, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      Buffer.from(discriminator('global', 'initialize_v2')),
    );
    const sig = await sendInstructions(connection, wallet, [initGlobalIx]);
    console.log(`initializeV2 tx: ${sig}`);
  }

  if (!adminInfo) {
    const initAdminIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: programId, isSigner: false, isWritable: false },
        { pubkey: programData, isSigner: false, isWritable: false },
        { pubkey: adminConfig, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      Buffer.concat([
        Buffer.from(discriminator('global', 'initialize_admin_config')),
        oraclePubkeyBytes,
        scoringModelHashBytes,
      ]),
    );
    const sig = await sendInstructions(connection, wallet, [initAdminIx]);
    console.log(`initializeAdminConfig tx: ${sig}`);
  } else {
    const parsed = parseAdminConfigAccount(adminInfo.data);
    if (!parsed) {
      throw new Error(`Invalid admin config account at ${adminConfig.toBase58()}`);
    }

    if (!parsed.authority.equals(wallet.publicKey)) {
      throw new Error(
        `Wallet is not admin authority. expected=${parsed.authority.toBase58()} actual=${wallet.publicKey.toBase58()}`,
      );
    }

    if (!parsed.oraclePubkey.equals(oraclePubkeyBytes)) {
      const rotateIx = buildIx(
        programId,
        [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: adminConfig, isSigner: false, isWritable: true },
        ],
        Buffer.concat([
          Buffer.from(discriminator('global', 'rotate_oracle')),
          oraclePubkeyBytes,
        ]),
      );
      const sig = await sendInstructions(connection, wallet, [rotateIx]);
      console.log(`rotateOracle tx: ${sig}`);
    }

    if (!parsed.activeScoringModelHash.equals(scoringModelHashBytes)) {
      const setHashIx = buildIx(
        programId,
        [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: adminConfig, isSigner: false, isWritable: true },
        ],
        Buffer.concat([
          Buffer.from(discriminator('global', 'set_scoring_model_hash')),
          scoringModelHashBytes,
        ]),
      );
      const sig = await sendInstructions(connection, wallet, [setHashIx]);
      console.log(`setScoringModelHash tx: ${sig}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
