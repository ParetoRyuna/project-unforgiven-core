import { NextRequest, NextResponse } from 'next/server';

import { LabInputValidationError, parseLabChallengeSubmitBody } from '@/app/api/lab/dto';
import { submitLabChallenge } from '@/services/behavior-lab-engine/src/session_store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseLabChallengeSubmitBody(body);
    const result = await submitLabChallenge(input);
    return NextResponse.json({
      schema_version: 1,
      shadow_mode_enabled: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof LabInputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'failed to submit challenge' },
      { status: 500 },
    );
  }
}
