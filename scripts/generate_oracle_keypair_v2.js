#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

const root = process.cwd();
const outDir = path.join(root, '.keys');
const outFile = process.argv[2] || path.join(outDir, 'oracle-v2.json');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const kp = Keypair.generate();
fs.writeFileSync(outFile, JSON.stringify(Array.from(kp.secretKey)));

console.log(`oracle pubkey: ${kp.publicKey.toBase58()}`);
console.log(`oracle keypair file: ${outFile}`);
console.log('');
console.log('Set these env vars before starting API:');
console.log(`export ORACLE_KEYPAIR_PATH="${outFile}"`);
console.log('export ORACLE_REQUIRE_STATIC_KEY=1');
