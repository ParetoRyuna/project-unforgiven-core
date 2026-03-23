#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

const ROOT = process.cwd();
const ENV_LOCAL = path.join(ROOT, '.env.local');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    programName: 'unforgiven_v2',
    idlName: null,
    programId: null,
    cluster: null,
    rpcUrl: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const next = args[i + 1];
    if (args[i] === '--program-name' && next) out.programName = next;
    if (args[i] === '--idl-name' && next) out.idlName = next;
    if (args[i] === '--program-id' && next) out.programId = next;
    if (args[i] === '--cluster' && next) out.cluster = next;
    if (args[i] === '--rpc-url' && next) out.rpcUrl = next;
  }

  out.idlName = out.idlName || out.programName;
  return out;
}

function idlPaths(idlName) {
  return {
    source: path.join(ROOT, 'target', 'idl', `${idlName}.json`),
    app: path.join(ROOT, 'app', 'idl', `${idlName}.json`),
    utils: path.join(ROOT, 'utils', `${idlName}.json`),
  };
}

function findProgramKeypair(programName) {
  return path.join(ROOT, 'target', 'deploy', `${programName}-keypair.json`);
}

function deriveProgramIdFromKeypair(programName) {
  const keypairPath = findProgramKeypair(programName);
  if (!fs.existsSync(keypairPath)) return null;
  const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey.toBase58();
}

function patchIdl(idl, programId) {
  return {
    ...idl,
    address: programId,
    metadata: {
      ...(idl.metadata || {}),
      address: programId,
    },
  };
}

function updateEnvFile(entries) {
  let text = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, 'utf8') : '';

  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    const nextLine = `${key}='${value}'`;
    if (new RegExp(`^${key}=`, 'm').test(text)) {
      text = text.replace(new RegExp(`^${key}=.*$`, 'm'), nextLine);
    } else {
      text = text.replace(/\s*$/, '\n');
      text += `${nextLine}\n`;
    }
  }

  fs.writeFileSync(ENV_LOCAL, text.trimEnd() + '\n');
}

function main() {
  const { programName, idlName, programId: argProgramId, cluster, rpcUrl } = parseArgs();
  const programId = argProgramId || deriveProgramIdFromKeypair(programName);
  if (!programId) {
    console.error(`Unable to resolve program id for ${programName}. Pass --program-id or build the deploy keypair first.`);
    process.exit(1);
  }

  const paths = idlPaths(idlName);
  if (!fs.existsSync(paths.source)) {
    console.error(`IDL not found at ${paths.source}. Run anchor build first.`);
    process.exit(1);
  }

  const rawIdl = JSON.parse(fs.readFileSync(paths.source, 'utf8'));
  const patchedIdl = JSON.stringify(patchIdl(rawIdl, programId), null, 2) + '\n';
  fs.writeFileSync(paths.source, patchedIdl);
  fs.writeFileSync(paths.app, patchedIdl);
  fs.writeFileSync(paths.utils, patchedIdl);

  updateEnvFile({
    NEXT_PUBLIC_PROGRAM_ID: programId,
    NEXT_PUBLIC_SOLANA_CLUSTER: cluster,
    NEXT_PUBLIC_SOLANA_RPC_URL: rpcUrl,
  });

  console.log('Synced deploy artifacts:');
  console.log(`- Program: ${programName}`);
  console.log(`- Program ID: ${programId}`);
  console.log(`- IDL source: ${paths.source}`);
  console.log(`- IDL app:    ${paths.app}`);
  console.log(`- IDL utils:  ${paths.utils}`);
  if (cluster) console.log(`- Cluster:    ${cluster}`);
  if (rpcUrl) console.log(`- RPC URL:    ${rpcUrl}`);
  console.log(`- Env file:   ${ENV_LOCAL}`);
}

main();
