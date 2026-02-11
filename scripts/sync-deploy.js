#!/usr/bin/env node
/**
 * Sync deploy artifacts to frontend:
 * - Copy target/idl/unforgiven.json -> app/idl + utils
 * - Update .env.local with NEXT_PUBLIC_PROGRAM_ID
 *
 * Usage:
 *   node scripts/sync-deploy.js --program-id <PUBKEY>
 *   node scripts/sync-deploy.js            # uses Anchor.toml programs.localnet
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IDL_SRC = path.join(ROOT, 'target', 'idl', 'unforgiven.json');
const IDL_APP = path.join(ROOT, 'app', 'idl', 'unforgiven.json');
const IDL_UTILS = path.join(ROOT, 'utils', 'unforgiven.json');
const ENV_LOCAL = path.join(ROOT, '.env.local');
const ANCHOR_TOML = path.join(ROOT, 'Anchor.toml');

function patchIdlWithMetadata(idl, programId) {
  const name = idl.name || 'unforgiven';
  const version = idl.version || '0.1.0';
  const metadata = idl.metadata || {};
  return {
    ...idl,
    metadata: {
      name: metadata.name || name,
      version: metadata.version || version,
      address: metadata.address || programId,
    },
    address: idl.address || programId,
  };
}

function readProgramIdFromAnchorToml() {
  if (!fs.existsSync(ANCHOR_TOML)) return null;
  const text = fs.readFileSync(ANCHOR_TOML, 'utf8');
  const m = text.match(/^\s*unforgiven\s*=\s*\"([1-9A-HJ-NP-Za-km-z]{32,44})\"/m);
  return m ? m[1] : null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--program-id' && args[i + 1]) {
      return { programId: args[i + 1] };
    }
  }
  return { programId: null };
}

function updateEnvLocal(programId) {
  const line = `NEXT_PUBLIC_PROGRAM_ID='${programId}'`;
  if (!fs.existsSync(ENV_LOCAL)) {
    fs.writeFileSync(ENV_LOCAL, line + '\n');
    return;
  }
  const text = fs.readFileSync(ENV_LOCAL, 'utf8');
  if (text.includes('NEXT_PUBLIC_PROGRAM_ID=')) {
    const updated = text.replace(/^NEXT_PUBLIC_PROGRAM_ID=.*$/m, line);
    fs.writeFileSync(ENV_LOCAL, updated);
  } else {
    fs.writeFileSync(ENV_LOCAL, text.replace(/\s*$/, '\n') + line + '\n');
  }
}

function main() {
  const { programId: argProgramId } = parseArgs();
  const programId = argProgramId || readProgramIdFromAnchorToml();
  if (!programId) {
    console.error('Missing program id. Pass --program-id or set it in Anchor.toml.');
    process.exit(1);
  }

  if (!fs.existsSync(IDL_SRC)) {
    console.error(`IDL not found at ${IDL_SRC}. Run anchor build first.`);
    process.exit(1);
  }

  const rawIdl = JSON.parse(fs.readFileSync(IDL_SRC, 'utf8'));
  const patchedIdl = patchIdlWithMetadata(rawIdl, programId);
  const out = JSON.stringify(patchedIdl, null, 2) + '\n';
  fs.writeFileSync(IDL_SRC, out);
  fs.writeFileSync(IDL_APP, out);
  fs.writeFileSync(IDL_UTILS, out);
  updateEnvLocal(programId);

  console.log('Synced IDL and program id:');
  console.log(`- ${IDL_APP}`);
  console.log(`- ${IDL_UTILS}`);
  console.log(`- ${ENV_LOCAL}`);
  console.log(`Program ID: ${programId}`);
}

main();
