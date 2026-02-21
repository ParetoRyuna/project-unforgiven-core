import { NextRequest, NextResponse } from "next/server";
import { applyOpenWorldAction } from "@/services/hide-sis-engine/src/openworld_engine";
import type { Action } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { world_id?: string; action?: Action };

    if (!body?.world_id || typeof body.world_id !== "string") {
      return NextResponse.json({ error: "world_id is required" }, { status: 400 });
    }
    if (!body?.action || typeof body.action !== "object") {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const payload = await applyOpenWorldAction({
      world_id: body.world_id,
      action: body.action,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to apply action" },
      { status: 400 },
    );
  }
}
