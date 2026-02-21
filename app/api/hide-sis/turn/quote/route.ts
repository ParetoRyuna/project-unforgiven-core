import { NextRequest, NextResponse } from "next/server";
import { quoteTurn } from "@/services/hide-sis-engine/src/session_store";

type QuoteBody = {
  session_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuoteBody;
    if (!body?.session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const quote = quoteTurn(body.session_id);
    return NextResponse.json({ quote });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to quote turn" },
      { status: 400 },
    );
  }
}

