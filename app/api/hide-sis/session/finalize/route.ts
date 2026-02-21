import { NextRequest, NextResponse } from "next/server";
import { finalizeSession } from "@/services/hide-sis-engine/src/session_store";

type FinalizeBody = {
  session_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FinalizeBody;
    if (!body?.session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const result = finalizeSession(body.session_id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to finalize session" },
      { status: 400 },
    );
  }
}

