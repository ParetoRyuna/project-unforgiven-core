import { NextRequest, NextResponse } from "next/server";
import { startSession } from "@/services/hide-sis-engine/src/session_store";
import { HIDE_SIS_SCHEMA_VERSION, TARGET_FIRST_CLEAR_TRUTH_RATE } from "@/packages/universal-shield-sdk/src/hide_sis_types";

type StartBody = {
  wallet?: string;
  mode?: "verified" | "guest" | "bot_suspected";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StartBody;
    const session = startSession({
      wallet: body?.wallet,
      mode: body?.mode,
    });

    return NextResponse.json({
      schema_version: HIDE_SIS_SCHEMA_VERSION,
      target_first_clear_truth_rate: TARGET_FIRST_CLEAR_TRUTH_RATE,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to start session" },
      { status: 400 },
    );
  }
}

