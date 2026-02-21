import { NextRequest, NextResponse } from 'next/server';

import { parseGraphEventIngestBody } from '@/app/api/graph/dto';
import { InputValidationError } from '@/app/api/hub/dto';
import { ingestGraphEvent } from '@/services/fan-pass-hub/src/graph_store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseGraphEventIngestBody(body);
    const result = ingestGraphEvent(input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to ingest graph event' }, { status: 500 });
  }
}
