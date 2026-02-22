#!/usr/bin/env node

if (process.env.SHOW_NODE_DEPRECATION !== '1') {
  process.noDeprecation = true;
}

const fs = require('fs');
const path = require('path');
const {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  discriminator,
  findAdminConfigPda,
  buildPreviewTxInstructions,
} = require('./tx_builder_v2');
const { deriveProgramDataAddress } = require('./solana_program_ids');

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('invalid hex length');
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function fetchShieldPayload(walletBase58) {
  const apiBase = process.env.SHIELD_API_BASE || 'http://127.0.0.1:3000';
  const res = await fetch(`${apiBase}/api/shield-score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: walletBase58, mode: 'guest', reclaim_attestations: [] }),
  });
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      `shield-score returned non-JSON from ${apiBase}/api/shield-score: ${raw.slice(0, 160)}`
    );
  }
  if (!res.ok) {
    throw new Error(`shield-score failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function buildIx(programId, keys, data) {
  return new TransactionInstruction({ programId, keys, data });
}

function parsePreviewEventFromLogs(logMessages) {
  const eventDisc = discriminator('event', 'PreviewPriceEvent');
  for (const line of logMessages || []) {
    const prefix = 'Program data: ';
    if (!line.startsWith(prefix)) continue;
    const raw = Buffer.from(line.slice(prefix.length), 'base64');
    if (raw.length < 30) continue;
    if (!raw.subarray(0, 8).equals(eventDisc)) continue;

    return {
      finalPrice: raw.readBigUInt64LE(8).toString(),
      isInfinite: raw.readUInt8(16) !== 0,
      blocked: raw.readUInt8(17) !== 0,
      effectiveVelocityBps: raw.readBigInt64LE(18).toString(),
      dignityScore: raw.readUInt8(26),
      adapterMask: raw.readUInt8(27),
      dignityBucket: raw.readUInt8(28),
      userMode: raw.readUInt8(29),
    };
  }
  return null;
}

function userModeToTier(userMode) {
  if (userMode === 2) return 'verified';
  if (userMode === 1) return 'guest';
  return 'bot_suspected';
}

function parsePayloadSummary(payloadBytes) {
  if (!payloadBytes || payloadBytes.length < 141) {
    return null;
  }
  const user = new PublicKey(payloadBytes.subarray(1, 33)).toBase58();
  const nonce = payloadBytes.readBigUInt64LE(133).toString();
  const userMode = payloadBytes.readUInt8(59);
  return {
    wallet: user,
    nonce,
    tier: userModeToTier(userMode),
  };
}

async function sendIxs(connection, payer, ixs, opts = {}) {
  const tx = new Transaction();
  if (opts.computeUnitLimit) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnitLimit }));
  }
  for (const ix of ixs) tx.add(ix);
  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

function parseAdminConfigAccount(data) {
  // Anchor account layout: 8 discriminator + authority(32) + oracle_pubkey(32) + active_hash(32) + bump(1)
  if (!data || data.length < 105) return null;
  return {
    authority: new PublicKey(data.subarray(8, 40)),
    oraclePubkey: Buffer.from(data.subarray(40, 72)),
    activeScoringModelHash: Buffer.from(data.subarray(72, 104)),
    bump: data[104],
  };
}

async function ensureAdminConfig(connection, wallet, programId, adminConfigPda, oraclePubkeyBytes, modelHashBytes) {
  const adminInfo = await connection.getAccountInfo(adminConfigPda, 'confirmed');
  if (!adminInfo) {
    const programData = deriveProgramDataAddress(programId);
    const initData = Buffer.concat([
      discriminator('global', 'initialize_admin_config'),
      oraclePubkeyBytes,
      modelHashBytes,
    ]);

    const initIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: programId, isSigner: false, isWritable: false },
        { pubkey: programData, isSigner: false, isWritable: false },
        { pubkey: adminConfigPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      initData,
    );

    const sig = await sendIxs(connection, wallet, [initIx]);
    console.log(`initializeAdminConfig tx: ${sig}`);
    return;
  }

  const parsed = parseAdminConfigAccount(adminInfo.data);
  if (!parsed) {
    throw new Error(`invalid admin_config account data at ${adminConfigPda.toBase58()}`);
  }

  if (!parsed.oraclePubkey.equals(oraclePubkeyBytes)) {
    const rotateData = Buffer.concat([
      discriminator('global', 'rotate_oracle'),
      oraclePubkeyBytes,
    ]);
    const rotateIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: adminConfigPda, isSigner: false, isWritable: true },
      ],
      rotateData,
    );
    const sig = await sendIxs(connection, wallet, [rotateIx]);
    console.log(`rotateOracle tx: ${sig}`);
  }

  if (!parsed.activeScoringModelHash.equals(modelHashBytes)) {
    const setData = Buffer.concat([
      discriminator('global', 'set_scoring_model_hash'),
      modelHashBytes,
    ]);
    const setIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: adminConfigPda, isSigner: false, isWritable: true },
      ],
      setData,
    );
    const sig = await sendIxs(connection, wallet, [setIx]);
    console.log(`setScoringModelHash tx: ${sig}`);
  }
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8899';
  const keypairPath = process.env.KEYPAIR_PATH || path.join(process.env.HOME, '.config/solana/id.json');
  const programKeypairPath = path.join(process.cwd(), 'target/deploy/unforgiven_v2-keypair.json');
  const previewCuLimit = Number(process.env.PREVIEW_COMPUTE_LIMIT || '600000');

  const wallet = loadKeypair(keypairPath);
  const programKp = loadKeypair(programKeypairPath);
  const programId = programKp.publicKey;
  const connection = new Connection(rpcUrl, 'confirmed');

  console.log(`wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`program: ${programId.toBase58()}`);

  const api = await fetchShieldPayload(wallet.publicKey.toBase58());
  const payloadBytes = Buffer.from(hexToBytes(api.payload_hex));
  const oracleSigBytes = Buffer.from(hexToBytes(api.oracle_signature_hex));
  const oraclePubkeyBytes = Buffer.from(new PublicKey(api.oracle_pubkey).toBytes());
  const modelHashBytes = Buffer.from(hexToBytes(api.scoring_model_hash_hex));

  const adminConfigPda = findAdminConfigPda(programId);
  await ensureAdminConfig(connection, wallet, programId, adminConfigPda, oraclePubkeyBytes, modelHashBytes);

  const { ed25519Ix, previewIx } = buildPreviewTxInstructions({
    programId,
    userPubkey: wallet.publicKey,
    adminConfigPda,
    payloadBytes,
    oracleSignatureBytes: oracleSigBytes,
    oraclePubkeyBytes,
  });

  const previewSig = await sendIxs(connection, wallet, [ed25519Ix, previewIx], {
    computeUnitLimit: previewCuLimit,
  });
  console.log(`previewPrice tx: ${previewSig}`);

  const payloadSummary = parsePayloadSummary(payloadBytes);
  const detail = await connection.getTransaction(previewSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const event = parsePreviewEventFromLogs(detail?.meta?.logMessages || []);
  if (!event) {
    console.log('PreviewPriceEvent not found in logs');
    console.log(
      JSON.stringify({
        event: 'preview_trigger_result',
        tx_signature: previewSig,
        wallet: payloadSummary ? payloadSummary.wallet : wallet.publicKey.toBase58(),
        nonce: payloadSummary ? payloadSummary.nonce : null,
        tier: payloadSummary ? payloadSummary.tier : 'unknown',
        blocked: null,
        price_lamports: null,
      }),
    );
    return;
  }

  console.log('PreviewPriceEvent:', event);
  console.log(
    JSON.stringify({
      event: 'preview_trigger_result',
      tx_signature: previewSig,
      wallet: payloadSummary ? payloadSummary.wallet : wallet.publicKey.toBase58(),
      nonce: payloadSummary ? payloadSummary.nonce : null,
      tier: payloadSummary ? payloadSummary.tier : 'unknown',
      blocked: event.blocked,
      price_lamports: event.finalPrice,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
