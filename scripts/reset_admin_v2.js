#!/usr/bin/env node

if (process.env.SHOW_NODE_DEPRECATION !== '1') {
  process.noDeprecation = true;
}

const fs = require('fs');
const path = require('path');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { discriminator, findAdminConfigPda } = require('./tx_builder_v2');

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('baseline hash must be 32-byte hex');
  }
  return Buffer.from(clean, 'hex');
}

async function fetchBaselineHash(walletBase58) {
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
  return hexToBytes(body.scoring_model_hash_hex);
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8899';
  const keypairPath = process.env.KEYPAIR_PATH || path.join(process.env.HOME, '.config/solana/id.json');
  const programKeypairPath = path.join(process.cwd(), 'target/deploy/unforgiven_v2-keypair.json');

  const wallet = loadKeypair(keypairPath);
  const programKp = loadKeypair(programKeypairPath);
  const programId = programKp.publicKey;
  const connection = new Connection(rpcUrl, 'confirmed');
  const adminConfigPda = findAdminConfigPda(programId);

  const baselineHash = process.env.BASELINE_SCORING_MODEL_HASH_HEX
    ? hexToBytes(process.env.BASELINE_SCORING_MODEL_HASH_HEX)
    : await fetchBaselineHash(wallet.publicKey.toBase58());

  const data = Buffer.concat([
    discriminator('global', 'reset_admin_guardrails'),
    baselineHash,
  ]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: adminConfigPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  const adminInfo = await connection.getAccountInfo(adminConfigPda, 'confirmed');
  const activeHashHex =
    adminInfo && adminInfo.data && adminInfo.data.length >= 105
      ? Buffer.from(adminInfo.data.subarray(72, 104)).toString('hex')
      : null;

  console.log(`program: ${programId.toBase58()}`);
  console.log(`admin_config_pda: ${adminConfigPda.toBase58()}`);
  console.log(`baseline_scoring_model_hash_hex: ${baselineHash.toString('hex')}`);
  console.log(`resetAdminGuardrails tx: ${sig}`);
  if (activeHashHex) {
    console.log(`active_scoring_model_hash_onchain_hex: ${activeHashHex}`);
  }
  console.log(
    JSON.stringify({
      event: 'admin_guardrails_reset',
      wallet: wallet.publicKey.toBase58(),
      tx_signature: sig,
      tier: 'reset',
      blocked: null,
      price_lamports: null,
      active_scoring_model_hash_onchain_hex: activeHashHex,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
