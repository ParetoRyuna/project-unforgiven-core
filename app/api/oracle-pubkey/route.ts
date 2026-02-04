import { NextResponse } from 'next/server';
import { Keypair } from '@solana/web3.js';

function getOracleKeypair(): Keypair {
  const envKey = process.env.ORACLE_PRIVATE_KEY;
  if (envKey) {
    try {
      const arr = JSON.parse(envKey) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch (e) {
      console.warn('Invalid ORACLE_PRIVATE_KEY, using ephemeral key');
    }
  }
  return Keypair.generate();
}

let _ORACLE_KEYPAIR: Keypair | null = null;
function getOracle(): Keypair {
  if (!_ORACLE_KEYPAIR) _ORACLE_KEYPAIR = getOracleKeypair();
  return _ORACLE_KEYPAIR;
}

/** GET: 返回当前 API 使用的 Oracle 公钥，供前端 initialize 时填入 */
export async function GET() {
  try {
    const oracle = getOracle();
    return NextResponse.json({
      oraclePubkey: oracle.publicKey.toBase58(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to get oracle pubkey' }, { status: 500 });
  }
}
