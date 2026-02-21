#!/usr/bin/env node

const crypto = require('crypto');
const {
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} = require('@solana/web3.js');

const PAYLOAD_LEN = 141;
const ORACLE_SIGNATURE_LEN = 64;

function discriminator(namespace, name) {
  return crypto.createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8);
}

function toBuffer(bytes, name) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  throw new Error(`${name} must be Buffer or Uint8Array`);
}

function findAdminConfigPda(programId) {
  const pid = new PublicKey(programId);
  return PublicKey.findProgramAddressSync([Buffer.from('admin_config_v2')], pid)[0];
}

function buildPreviewInstructionData(payloadBytes, oracleSignatureBytes) {
  const payload = toBuffer(payloadBytes, 'payloadBytes');
  const sig = toBuffer(oracleSignatureBytes, 'oracleSignatureBytes');

  if (payload.length !== PAYLOAD_LEN) {
    throw new Error(`payloadBytes length mismatch: expected ${PAYLOAD_LEN}, got ${payload.length}`);
  }
  if (sig.length !== ORACLE_SIGNATURE_LEN) {
    throw new Error(
      `oracleSignatureBytes length mismatch: expected ${ORACLE_SIGNATURE_LEN}, got ${sig.length}`
    );
  }

  return Buffer.concat([discriminator('global', 'preview_price'), payload, sig]);
}

function buildPreviewTxInstructions({
  programId,
  userPubkey,
  adminConfigPda,
  payloadBytes,
  oracleSignatureBytes,
  oraclePubkeyBytes,
}) {
  const pid = new PublicKey(programId);
  const user = new PublicKey(userPubkey);
  const admin = new PublicKey(adminConfigPda);
  const payload = toBuffer(payloadBytes, 'payloadBytes');
  const sig = toBuffer(oracleSignatureBytes, 'oracleSignatureBytes');
  const oraclePk = toBuffer(oraclePubkeyBytes, 'oraclePubkeyBytes');

  if (oraclePk.length !== 32) {
    throw new Error(`oraclePubkeyBytes length mismatch: expected 32, got ${oraclePk.length}`);
  }

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: Uint8Array.from(oraclePk),
    message: Uint8Array.from(payload),
    signature: Uint8Array.from(sig),
  });

  const previewIx = new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: admin, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildPreviewInstructionData(payload, sig),
  });

  return { ed25519Ix, previewIx };
}

module.exports = {
  PAYLOAD_LEN,
  ORACLE_SIGNATURE_LEN,
  discriminator,
  findAdminConfigPda,
  buildPreviewInstructionData,
  buildPreviewTxInstructions,
};

if (require.main === module) {
  console.log('tx_builder_v2 loaded');
}
