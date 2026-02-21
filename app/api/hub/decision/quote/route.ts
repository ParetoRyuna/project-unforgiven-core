import { NextRequest, NextResponse } from 'next/server';

import { InputValidationError, parseHubDecisionQuoteBody } from '@/app/api/hub/dto';
import { quoteHubDecision } from '@/services/fan-pass-hub/src/decision_engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseHubDecisionQuoteBody(body);
    const quote = await quoteHubDecision(input);
    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to quote hub decision' }, { status: 500 });
  }
}
