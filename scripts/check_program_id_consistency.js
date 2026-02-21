#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');

const root = process.cwd();
const anchorTomlPath = path.join(root, 'Anchor.toml');
const libPath = path.join(root, 'programs/unforgiven_v2/src/lib.rs');
const sentinelCfgPath = path.join(root, 'configs/sentinel_config_v2.toml');
const sentinelDemoCfgPath = path.join(root, 'configs/sentinel_config_v2.demo.toml');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exitCode = 1;
}

const anchorToml = fs.readFileSync(anchorTomlPath, 'utf8');
const libRs = fs.readFileSync(libPath, 'utf8');
const sentinelCfg = fs.existsSync(sentinelCfgPath) ? fs.readFileSync(sentinelCfgPath, 'utf8') : '';
const sentinelDemoCfg = fs.existsSync(sentinelDemoCfgPath)
  ? fs.readFileSync(sentinelDemoCfgPath, 'utf8')
  : '';

const anchorProgramMatch = anchorToml.match(/^\s*unforgiven_v2\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/m);
const declareIdMatch = libRs.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]{32,44})"\);/);

if (!anchorProgramMatch) fail('Anchor.toml missing programs.localnet.unforgiven_v2');
if (!declareIdMatch) fail('lib.rs missing declare_id!(...)');

if (anchorProgramMatch && declareIdMatch) {
  const anchorId = anchorProgramMatch[1];
  const declareId = declareIdMatch[1];
  if (anchorId !== declareId) {
    fail(`program id mismatch: Anchor.toml=${anchorId}, lib.rs=${declareId}`);
  } else {
    console.log(`OK: program id consistent (${anchorId})`);
  }

  function checkSentinelCfg(label, raw) {
    if (!raw) return;
    const cfgProgramMatch = raw.match(/^\s*program_id\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/m);
    const cfgAdminMatch = raw.match(/^\s*admin_config_pubkey\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/m);
    if (cfgProgramMatch && cfgAdminMatch) {
      const cfgProgram = new PublicKey(cfgProgramMatch[1]);
      const cfgAdmin = new PublicKey(cfgAdminMatch[1]);
      const [derived] = PublicKey.findProgramAddressSync([Buffer.from('admin_config_v2')], cfgProgram);
      if (!cfgAdmin.equals(derived)) {
        fail(
          `${label} admin_config_pubkey mismatch: configured=${cfgAdmin.toBase58()}, derived=${derived.toBase58()}`
        );
      } else {
        console.log(`OK: ${label} admin_config_pubkey matches PDA (${derived.toBase58()})`);
      }
    }
  }

  if (sentinelCfg) {
    const cfgProgramMatch = sentinelCfg.match(/^\s*program_id\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/m);
    const cfgAdminMatch = sentinelCfg.match(/^\s*admin_config_pubkey\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/m);
    if (cfgProgramMatch && cfgAdminMatch) {
      const cfgProgram = new PublicKey(cfgProgramMatch[1]);
      const cfgAdmin = new PublicKey(cfgAdminMatch[1]);
      const [derived] = PublicKey.findProgramAddressSync([Buffer.from('admin_config_v2')], cfgProgram);
      if (!cfgAdmin.equals(derived)) {
        fail(
          `sentinel admin_config_pubkey mismatch: configured=${cfgAdmin.toBase58()}, derived=${derived.toBase58()}`
        );
      } else {
        console.log(`OK: sentinel admin_config_pubkey matches PDA (${derived.toBase58()})`);
      }
    }
  }

  checkSentinelCfg('sentinel_demo', sentinelDemoCfg);
}

if (process.exitCode) {
  process.exit(1);
}
