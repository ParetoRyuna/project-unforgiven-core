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
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  findAdminConfigPda,
  buildPreviewTxInstructions,
  discriminator,
} = require('./tx_builder_v2');
const { deriveProgramDataAddress } = require('./solana_program_ids');

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('invalid hex length');
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

async function fetchShieldPayload(walletBase58) {
  const apiBase = process.env.SHIELD_API_BASE || 'http://127.0.0.1:3100';
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

function userModeToTier(userMode) {
  if (userMode === 2) return 'verified';
  if (userMode === 1) return 'guest';
  return 'bot_suspected';
}

function parsePayloadSummary(payloadBytes) {
  if (!payloadBytes || payloadBytes.length < 141) return null;
  return {
    nonce: payloadBytes.readBigUInt64LE(133).toString(),
    tier: userModeToTier(payloadBytes.readUInt8(59)),
  };
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
      blocked: raw.readUInt8(17) !== 0,
    };
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPreviewEventWithRetry(connection, signature, attempts = 60, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    const detail = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    const event = parsePreviewEventFromLogs(detail?.meta?.logMessages || []);
    if (event) return event;
    await sleep(delayMs);
  }
  return null;
}

async function findRecentEvent(connection, signatures, scanLimit = 10) {
  const slice = signatures.slice(-scanLimit).reverse();
  for (const sig of slice) {
    const event = await fetchPreviewEventWithRetry(connection, sig, 12, 180);
    if (event) {
      return { sig, event };
    }
  }
  return null;
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
        { pubkey: require('@solana/web3.js').SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      initData,
    );

    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [wallet], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    console.log(`initializeAdminConfig tx: ${sig}`);
    return;
  }

  const parsed = parseAdminConfigAccount(adminInfo.data);
  if (!parsed) {
    throw new Error(`invalid admin_config account data at ${adminConfigPda.toBase58()}`);
  }

  if (!parsed.oraclePubkey.equals(oraclePubkeyBytes)) {
    const rotateData = Buffer.concat([discriminator('global', 'rotate_oracle'), oraclePubkeyBytes]);
    const rotateIx = buildIx(
      programId,
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: adminConfigPda, isSigner: false, isWritable: true },
      ],
      rotateData,
    );
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(rotateIx), [wallet], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
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
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(setIx), [wallet], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    console.log(`setScoringModelHash tx: ${sig}`);
  }
}

async function main() {
  const n = Number(process.argv[2] || '40');
  const concurrency = Number(process.env.BURST_CONCURRENCY || '8');
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8899';
  const keypairPath = process.env.KEYPAIR_PATH || path.join(process.env.HOME, '.config/solana/id.json');
  const programKeypairPath = path.join(process.cwd(), 'target/deploy/unforgiven_v2-keypair.json');
  const cuLimit = Number(process.env.PREVIEW_COMPUTE_LIMIT || '600000');

  const wallet = loadKeypair(keypairPath);
  const programKp = loadKeypair(programKeypairPath);
  const programId = programKp.publicKey;
  const connection = new Connection(rpcUrl, 'confirmed');

  console.log(`wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`program: ${programId.toBase58()}`);
  console.log(`burst: n=${n} concurrency=${concurrency}`);

  // One payload fetch to align oracle pubkey + model hash, then admin ensure once.
  const first = await fetchShieldPayload(wallet.publicKey.toBase58());
  const oraclePubkeyBytes = Buffer.from(new PublicKey(first.oracle_pubkey).toBytes());
  const modelHashBytes = Buffer.from(hexToBytes(first.scoring_model_hash_hex));
  const adminConfigPda = findAdminConfigPda(programId);
  await ensureAdminConfig(connection, wallet, programId, adminConfigPda, oraclePubkeyBytes, modelHashBytes);

  let sent = 0;
  let ok = 0;
  let failed = 0;

  async function one(i) {
    const api = await fetchShieldPayload(wallet.publicKey.toBase58());
    const payloadBytes = Buffer.from(hexToBytes(api.payload_hex));
    const oracleSigBytes = Buffer.from(hexToBytes(api.oracle_signature_hex));
    const payloadSummary = parsePayloadSummary(payloadBytes);

    const { ed25519Ix, previewIx } = buildPreviewTxInstructions({
      programId,
      userPubkey: wallet.publicKey,
      adminConfigPda,
      payloadBytes,
      oracleSignatureBytes: oracleSigBytes,
      oraclePubkeyBytes,
    });

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ed25519Ix,
      previewIx,
    );

    const sig = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: true,
      maxRetries: 3,
    });
    // Confirm so it lands in logs with commitment=confirmed.
    await connection.confirmTransaction(sig, 'confirmed');

    return { sig, payloadSummary };
  }

  const inflight = new Set();
  const sigs = [];
  let lastTelemetry = null;

  for (let i = 0; i < n; i++) {
    const p = one(i)
      .then(({ sig, payloadSummary }) => {
        ok++;
        sigs.push(sig);
        lastTelemetry = payloadSummary;
        if ((ok + failed) % 5 === 0) {
          console.log(`progress: ok=${ok} failed=${failed}`);
        }
      })
      .catch((e) => {
        failed++;
        if (failed <= 3) {
          console.error(`burst item failed: ${e?.message || e}`);
        }
      })
      .finally(() => inflight.delete(p));

    inflight.add(p);
    sent++;

    while (inflight.size >= concurrency) {
      await Promise.race(Array.from(inflight));
    }
  }

  await Promise.allSettled(Array.from(inflight));

  console.log(`done: sent=${sent} ok=${ok} failed=${failed}`);
  if (sigs.length) {
    console.log(`lastSig: ${sigs[sigs.length - 1]}`);
    const recent = await findRecentEvent(connection, sigs, 10);
    const eventSig = recent ? recent.sig : sigs[sigs.length - 1];
    const lastEvent = recent ? recent.event : null;
    console.log(
      JSON.stringify({
        event: 'preview_burst_result',
        wallet: wallet.publicKey.toBase58(),
        nonce: lastTelemetry ? lastTelemetry.nonce : null,
        tier: lastTelemetry ? lastTelemetry.tier : 'unknown',
        tx_signature: eventSig,
        blocked: lastEvent ? lastEvent.blocked : null,
        price_lamports: lastEvent ? lastEvent.finalPrice : null,
        sent,
        ok,
        failed,
      }),
    );
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
