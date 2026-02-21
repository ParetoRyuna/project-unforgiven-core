import { NextRequest, NextResponse } from "next/server";
import { commitTurn } from "@/services/hide-sis-engine/src/session_store";

type CommitBody = {
  session_id?: string;
  choice_id?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CommitBody;
    if (!body?.session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }
    if (typeof body.choice_id !== "number") {
      return NextResponse.json({ error: "choice_id is required" }, { status: 400 });
    }

    const result = commitTurn({
      sessionId: body.session_id,
      choiceId: body.choice_id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to commit turn" },
      { status: 400 },
    );
  }
}

