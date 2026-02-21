import { NextResponse } from 'next/server';

import { getFanPassCatalog } from '@/services/fan-pass-hub/src/hub_workflow';

export async function GET() {
  try {
    const catalog = getFanPassCatalog();
    return NextResponse.json(catalog, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load fan pass catalog' }, { status: 500 });
  }
}
