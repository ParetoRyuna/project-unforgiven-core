import { NextResponse } from 'next/server';
import { getShieldRuntimeConfigPayload } from '@/services/shield-oracle/src/handler';

export async function GET() {
  try {
    return NextResponse.json(getShieldRuntimeConfigPayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get shield config';
    console.error(
      JSON.stringify({
        event: 'shield_runtime_config_unavailable',
        error: message,
      }),
    );
    const status = message.includes('Static Oracle key required') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
