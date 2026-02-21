import fs from 'fs';
import { Keypair } from '@solana/web3.js';

function requireStaticKey(): boolean {
  if (process.env.ORACLE_REQUIRE_STATIC_KEY === '1') return true;
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.ORACLE_ALLOW_EPHEMERAL_IN_PRODUCTION !== '1'
  );
}

function loadOracleKeypairFromEnv(): Keypair | null {
  const envKey = process.env.ORACLE_PRIVATE_KEY;
  if (!envKey) return null;

  try {
    const arr = JSON.parse(envKey) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    return null;
  }
}

function loadOracleKeypairFromPath(): Keypair | null {
  const keyPath = process.env.ORACLE_KEYPAIR_PATH;
  if (!keyPath) return null;

  try {
    const raw = fs.readFileSync(keyPath, 'utf8');
    const arr = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    return null;
  }
}

let ORACLE: Keypair | null = null;

export function oracleKeypair(): Keypair {
  if (ORACLE) return ORACLE;
  const mustBeStatic = requireStaticKey();
  ORACLE = loadOracleKeypairFromEnv() ?? loadOracleKeypairFromPath();
  if (!ORACLE && mustBeStatic) {
    throw new Error(
      'Static Oracle key required: set ORACLE_PRIVATE_KEY or ORACLE_KEYPAIR_PATH (or ORACLE_ALLOW_EPHEMERAL_IN_PRODUCTION=1 only for non-production fallback).'
    );
  }
  ORACLE = ORACLE ?? Keypair.generate();
  return ORACLE;
}

export function oraclePubkeyBase58(): string {
  return oracleKeypair().publicKey.toBase58();
}
