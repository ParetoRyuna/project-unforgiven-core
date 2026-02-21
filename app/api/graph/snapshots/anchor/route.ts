import { NextResponse } from 'next/server';

import { anchorCurrentSnapshot } from '@/services/fan-pass-hub/src/graph_store';
import { SolanaAdapter } from '@/services/fan-pass-hub/src/chain_adapter';

export async function POST() {
  try {
    const adapter = new SolanaAdapter();
    const receipt = await anchorCurrentSnapshot(adapter);
    return NextResponse.json(receipt, { status: 200 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to anchor snapshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
