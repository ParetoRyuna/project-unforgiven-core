#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const cargoTomlPath = path.join(root, 'Cargo.toml');
const vendorPatchDir = path.join(root, 'vendor', 'getrandom-0.1.16');

const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');

const patchSection = /\[patch\.crates-io\][\s\S]*?(?=\n\[|$)/m.exec(cargoToml);
if (patchSection && /getrandom\s*=/.test(patchSection[0])) {
  console.error('ERROR: Cargo.toml still contains a getrandom patch in [patch.crates-io].');
  process.exit(1);
}

if (fs.existsSync(vendorPatchDir)) {
  console.error(`ERROR: legacy vendor directory still exists: ${vendorPatchDir}`);
  process.exit(1);
}

console.log('OK: no getrandom vendor patch detected');
