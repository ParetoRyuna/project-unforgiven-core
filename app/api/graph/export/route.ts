import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { exportWalletGraph } from '@/services/fan-pass-hub/src/graph_store';

function parseWallet(value: string | null): string {
  if (!value || value.trim().length === 0) throw new Error('wallet query is required');
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error('wallet must be a valid Solana public key');
  }
}

export async function GET(req: NextRequest) {
  try {
    const wallet = parseWallet(req.nextUrl.searchParams.get('wallet'));
    const payload = exportWalletGraph(wallet);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export graph';
    const status = message.includes('wallet') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
