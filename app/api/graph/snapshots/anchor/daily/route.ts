import { NextRequest, NextResponse } from 'next/server';

import { anchorCurrentSnapshot } from '@/services/fan-pass-hub/src/graph_store';
import { SolanaAdapter } from '@/services/fan-pass-hub/src/chain_adapter';

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.HUB_DAILY_ANCHOR_TOKEN?.trim() ?? '';
  if (!expectedToken) {
    return NextResponse.json({ error: 'HUB_DAILY_ANCHOR_TOKEN is not configured' }, { status: 503 });
  }
  const providedToken = extractBearerToken(req);
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adapter = new SolanaAdapter();
    const receipt = await anchorCurrentSnapshot(adapter);
    return NextResponse.json(receipt, { status: 200 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Daily anchor failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
