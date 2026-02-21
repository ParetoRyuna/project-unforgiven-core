import { NextRequest, NextResponse } from "next/server";
import { finalizeOpenWorldSession } from "@/services/hide-sis-engine/src/openworld_engine";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { world_id?: string; manual?: boolean };
    if (!body?.world_id || typeof body.world_id !== "string") {
      return NextResponse.json({ error: "world_id is required" }, { status: 400 });
    }

    const payload = await finalizeOpenWorldSession(body.world_id);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to finalize session" },
      { status: 400 },
    );
  }
}
