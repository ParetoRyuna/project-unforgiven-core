/**
 * Generate a persistent Ed25519 admin keypair for the Oracle API.
 * Run: npx ts-node scripts/generate-admin-key.ts
 * Copy the output into .env as ADMIN_SECRET_KEY and (optionally) ADMIN_PUBLIC_KEY.
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

function main(): void {
  const keypair = Keypair.generate();

  // Verify: sign and verify a test message
  const testMessage = new TextEncoder().encode('UNFORGIVEN Oracle key verification');
  const signature = nacl.sign.detached(testMessage, keypair.secretKey);
  const verified = nacl.sign.detached.verify(
    testMessage,
    signature,
    keypair.publicKey.toBytes()
  );

  if (!verified) {
    console.error('Verification failed: sign/verify round-trip failed.');
    process.exit(1);
  }

  const secretKeyJson = JSON.stringify(Array.from(keypair.secretKey));
  const publicKeyBase58 = keypair.publicKey.toBase58();

  console.log('--- Copy the following into your .env ---\n');
  console.log(`ADMIN_SECRET_KEY=${secretKeyJson}`);
  console.log(`ADMIN_PUBLIC_KEY=${publicKeyBase58}`);
  console.log('\n--- Verification: sign/verify OK ---');
}

main();
