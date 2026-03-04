import { NextRequest, NextResponse } from 'next/server';

import { LabInputValidationError, parseLabSessionStartBody } from '@/app/api/lab/dto';
import { startLabSession } from '@/services/behavior-lab-engine/src/session_store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseLabSessionStartBody(body);
    const result = startLabSession(input);
    return NextResponse.json({
      schema_version: 1,
      shadow_mode_enabled: true,
      session: result.session,
      entry: result.entry,
    });
  } catch (error) {
    if (error instanceof LabInputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'failed to start lab session' },
      { status: 400 },
    );
  }
}
