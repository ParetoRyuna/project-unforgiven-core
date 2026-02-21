import { NextResponse } from 'next/server';
import { getOraclePubkeyPayload } from '@/services/shield-oracle/src/handler';

/** GET: 返回当前 API 使用的 Oracle 公钥，供前端 initialize 时填入 */
export async function GET() {
  try {
    return NextResponse.json(getOraclePubkeyPayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get oracle pubkey';
    console.error(
      JSON.stringify({
        event: 'oracle_pubkey_unavailable',
        error: message,
      }),
    );
    const status = message.includes('Static Oracle key required') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
