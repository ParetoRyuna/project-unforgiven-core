import { NextRequest, NextResponse } from 'next/server';

import { InputValidationError } from '@/app/api/hub/dto';
import { parseExecuteFanPassWorkflowBody } from '@/app/api/fan-pass/dto';
import { executeFanPassWorkflow } from '@/services/fan-pass-hub/src/hub_workflow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseExecuteFanPassWorkflowBody(body);
    const result = await executeFanPassWorkflow(input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to execute fan pass workflow';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
