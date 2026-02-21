import { NextRequest, NextResponse } from "next/server";
import { startOpenWorld } from "@/services/hide-sis-engine/src/openworld_engine";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      theme_prompt?: string;
      genre_tags?: string[];
      constraints?: string[];
    };

    if (!body?.theme_prompt || typeof body.theme_prompt !== "string") {
      return NextResponse.json({ error: "theme_prompt is required" }, { status: 400 });
    }

    const payload = await startOpenWorld({
      theme_prompt: body.theme_prompt,
      genre_tags: Array.isArray(body.genre_tags) ? body.genre_tags : undefined,
      constraints: Array.isArray(body.constraints) ? body.constraints : undefined,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to start openworld session" },
      { status: 400 },
    );
  }
}
