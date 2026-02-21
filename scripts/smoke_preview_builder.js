#!/usr/bin/env node

const { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } = require('@solana/web3.js');
const {
  PAYLOAD_LEN,
  ORACLE_SIGNATURE_LEN,
  buildPreviewInstructionData,
  buildPreviewTxInstructions,
  findAdminConfigPda,
} = require('./tx_builder_v2');

const programId = new PublicKey('5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW');
const user = new PublicKey('92MXryYumqfooXdYAApXYBojQ9kqd5cX7kZJ1X3RgcVB');
const admin = findAdminConfigPda(programId);
const payload = Buffer.alloc(PAYLOAD_LEN, 7);
const sig = Buffer.alloc(ORACLE_SIGNATURE_LEN, 9);
const oraclePk = Buffer.alloc(32, 3);

const data = buildPreviewInstructionData(payload, sig);
if (data.length !== 8 + PAYLOAD_LEN + ORACLE_SIGNATURE_LEN) {
  throw new Error(`unexpected preview instruction data length: ${data.length}`);
}

const { ed25519Ix, previewIx } = buildPreviewTxInstructions({
  programId,
  userPubkey: user,
  adminConfigPda: admin,
  payloadBytes: payload,
  oracleSignatureBytes: sig,
  oraclePubkeyBytes: oraclePk,
});

if (!ed25519Ix.programId.equals(new PublicKey('Ed25519SigVerify111111111111111111111111111'))) {
  throw new Error('ed25519 ix program id mismatch');
}
if (previewIx.keys.length !== 3) {
  throw new Error('preview ix key count mismatch');
}
if (!previewIx.keys[2].pubkey.equals(SYSVAR_INSTRUCTIONS_PUBKEY)) {
  throw new Error('preview ix missing instructions sysvar key');
}

console.log('OK: tx_builder_v2 preview instruction smoke test passed');
