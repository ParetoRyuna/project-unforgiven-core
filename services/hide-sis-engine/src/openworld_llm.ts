import type {
  Action,
  LlmExplainer,
  OpenWorldFinalizePayload,
  PersonalizedEnding,
  ScenePayload,
  ScoreBreakdown,
  WorldSeed,
  WorldState,
  PlayerState,
} from "../../../packages/universal-shield-sdk/src/hide_sis_openworld_types";

type SceneInput = {
  worldSeed: WorldSeed;
  worldState: WorldState;
  playerState: PlayerState;
  action: Action;
  choices: ScenePayload["choices"];
  effects: ScenePayload["effects"];
  opening?: boolean;
};

type EndingInput = {
  worldSeed: WorldSeed;
  worldState: WorldState;
  playerState: PlayerState;
  score: ScoreBreakdown;
  engineSummary: string[];
  reasonCodes: string[];
  actionTrace: string[];
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeBeats(raw: unknown): ScenePayload["beats"] | null {
  if (!Array.isArray(raw)) return null;
  const beats = raw
    .map((beat) => ({
      speaker: isNonEmptyString((beat as { speaker?: string })?.speaker) ? (beat as { speaker: string }).speaker : "Narrator",
      cn: isNonEmptyString((beat as { cn?: string })?.cn) ? (beat as { cn: string }).cn : "",
      en: isNonEmptyString((beat as { en?: string })?.en) ? (beat as { en: string }).en : "",
      emotion: isNonEmptyString((beat as { emotion?: string })?.emotion) ? (beat as { emotion: string }).emotion : "calm",
      sfx: isNonEmptyString((beat as { sfx?: string })?.sfx) ? (beat as { sfx: string }).sfx : undefined,
    }))
    .filter((beat) => beat.cn && beat.en);
  return beats.length > 0 ? beats.slice(0, 6) : null;
}

function toActionLine(action: Action): string {
  switch (action.type) {
    case "MOVE":
      return `MOVE -> ${action.target_id}`;
    case "INTERROGATE":
      return `INTERROGATE -> ${action.target_id}`;
    case "SEARCH":
      return "SEARCH";
    case "USE_CLUE":
      return `USE_CLUE ${action.clue_id} -> ${action.target_id}`;
    case "LIE":
      return `LIE -> ${action.target_id}`;
    case "ALLY":
      return `ALLY -> ${action.target_id}`;
    case "REST":
      return "REST";
    default:
      return "ACTION";
  }
}

function buildScenePrompt(input: SceneInput): string {
  const locations = input.worldState.locations.map((loc) => `${loc.id}:${loc.name}`).join(", ");
  const npcs = input.worldState.npcs.map((npc) => `${npc.id}:${npc.name}(${npc.role})`).join(", ");
  const inventory = input.playerState.inventory.map((clue) => clue.label).join(" / ") || "none";
  const actionLine = toActionLine(input.action);
  const openingLine = input.opening
    ? "Opening scene: include a strong hook with a three-minute countdown, partial confession, and immediate threat. Mention Picha and Baibua."
    : "";

  return `Return JSON only. Use this JSON schema:
{
  "beats": [{"speaker":string, "cn":string, "en":string, "emotion":string, "sfx"?:string}]
}

World theme: ${input.worldSeed.theme_prompt}
Genre: ${input.worldSeed.genre_tags.join(", ")}
Constraints: ${input.worldSeed.constraints.join(", ")}
Locations: ${locations}
NPCs: ${npcs}
Inventory: ${inventory}
Current location: ${input.playerState.current_location}
Dignity: ${input.playerState.dignity}
Pollution: ${input.playerState.pollution_score}
Truth: ${input.playerState.truth_progress}
Heat: ${input.worldState.heat}
Action: ${actionLine}
${openingLine}

Voice rules: Picha is sharp and teasing. Baibua is cold and precise. Keep PG-13.
Generate 3-5 beats. CN primary, EN secondary.`;
}

function buildEndingPrompt(input: EndingInput): string {
  return `Return JSON only with schema:
{
  "personalized_ending": {
    "title_cn": string,
    "title_en": string,
    "epilogue_cn": string,
    "epilogue_en": string,
    "ending_tags": string[],
    "future_hook_cn": string,
    "future_hook_en": string
  },
  "llm_explainer": {
    "summary_cn": string,
    "summary_en": string,
    "score_delta": {"truth": number, "purity": number, "relation": number, "humanity": number}
  }
}

Theme: ${input.worldSeed.theme_prompt}
Score: truth=${input.score.truth}, purity=${input.score.purity}, relation=${input.score.relation}, humanity=${input.score.humanity}, composite=${input.score.composite}, grade=${input.score.grade}
Engine summary: ${input.engineSummary.join(" | ")}
Reason codes: ${input.reasonCodes.join(", ")}
Action trace: ${input.actionTrace.slice(-10).join(" -> ")}

Constraints:
- Keep PG-13.
- Make the ending specific to this player's trajectory.
- score_delta per dimension must stay small: between -3 and +3.
- The tone should feel like a thriller epilogue, not fantasy.`;
}

async function callOpenAI(prompt: string, temperature: number): Promise<unknown | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a narrative and scoring assistant. Output strict JSON only. Never output markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: 900,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content;
  if (!isNonEmptyString(text)) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolveNpcName(input: SceneInput): string | null {
  const targetId = "target_id" in input.action ? input.action.target_id : undefined;
  if (!targetId) return null;
  return input.worldState.npcs.find((entry) => entry.id === targetId)?.name ?? null;
}

function npcVoiceBeat(name: string): ScenePayload["beats"][number] {
  const lower = name.toLowerCase();
  if (lower.includes("picha")) {
    return {
      speaker: name,
      cn: "你又来试探我？笑容里像藏着刀。",
      en: "Probing again? Your smile hides a blade.",
      emotion: "teasing",
    };
  }
  if (lower.includes("baibua")) {
    return {
      speaker: name,
      cn: "别把情绪当作筹码，我只看证据。",
      en: "Don't trade in emotions. I only read evidence.",
      emotion: "cold",
    };
  }
  if (lower.includes("archivist")) {
    return {
      speaker: name,
      cn: "档案不会说谎，谎言只是人的习惯。",
      en: "Records do not lie; only people do.",
      emotion: "formal",
    };
  }
  return {
    speaker: name,
    cn: "你逼近了一步，但代价未必可见。",
    en: "You step closer, but the price is unseen.",
    emotion: "guarded",
  };
}

export function buildFallbackScene(input: SceneInput): ScenePayload {
  if (input.opening) {
    return {
      beats: [
        {
          speaker: "Narrator",
          cn: "警报在老宅上空拉响，你只有三分钟。",
          en: "The alarm cuts through the manor. You have three minutes.",
          emotion: "tense",
        },
        {
          speaker: "Picha",
          cn: "别看我，我只会给你一半真相。",
          en: "Don't look at me. I only give you half the truth.",
          emotion: "teasing",
        },
        {
          speaker: "Baibua",
          cn: "浪费每一步，都会变成你的判词。",
          en: "Every wasted step becomes your verdict.",
          emotion: "cold",
        },
      ],
      choices: input.choices,
      effects: input.effects,
    };
  }

  const actionLine = toActionLine(input.action);
  const npcName = resolveNpcName(input);
  const beats: ScenePayload["beats"] = [
    {
      speaker: "Narrator",
      cn: `你执行了行动：${actionLine}。`,
      en: `You executed: ${actionLine}.`,
      emotion: "calm",
    },
  ];
  if (npcName) beats.push(npcVoiceBeat(npcName));
  beats.push({
    speaker: "Narrator",
    cn: "房间里的空气更紧了，你必须更谨慎。",
    en: "The room tightens. You must become deliberate.",
    emotion: "resolute",
  });
  return {
    beats,
    choices: input.choices,
    effects: input.effects,
  };
}

export async function generateScenePayload(input: SceneInput): Promise<ScenePayload> {
  const parsed = await callOpenAI(buildScenePrompt(input), 0.8);
  const beats = normalizeBeats((parsed as { beats?: unknown })?.beats);
  if (!beats) return buildFallbackScene(input);
  return {
    beats,
    choices: input.choices,
    effects: input.effects,
  };
}

function fallbackEnding(input: EndingInput): OpenWorldFinalizePayload {
  const tags = [...input.reasonCodes];
  if (input.score.grade === "S" || input.score.grade === "A") tags.push("clean-finish");
  if (input.score.purity < 60) tags.push("contaminated");
  if (input.worldState.heat >= 70) tags.push("chaotic");

  return {
    score: input.score,
    engine_summary: input.engineSummary,
    reason_codes: input.reasonCodes,
    personalized_ending: {
      title_cn: `结算等级 ${input.score.grade}：秘密仍在呼吸`,
      title_en: `Grade ${input.score.grade}: Secrets Still Breathing`,
      epilogue_cn:
        "你离开了老宅，带走了一份被你亲手修正过的真相。夜色没有给出答案，只给出了代价。",
      epilogue_en:
        "You leave the manor with a truth rewritten by your own hands. The night gives no answers, only costs.",
      ending_tags: Array.from(new Set(tags)).slice(0, 6),
      future_hook_cn: "下一次，谁会先开口：你、Picha，还是 Baibua？",
      future_hook_en: "Next time, who speaks first: you, Picha, or Baibua?",
    },
    llm_explainer: {
      summary_cn: "系统按四维评分得出结果，个性化终章已根据你的行动轨迹生成。",
      summary_en: "The result follows four-axis scoring, with an epilogue personalized from your action trace.",
      score_delta: { truth: 0, purity: 0, relation: 0, humanity: 0 },
    },
  };
}

function normalizeScoreDelta(raw: unknown): LlmExplainer["score_delta"] {
  const candidate = raw as Partial<Record<"truth" | "purity" | "relation" | "humanity", number>> | undefined;
  let truth = clamp(Math.round(safeNumber(candidate?.truth, 0)), -3, 3);
  let purity = clamp(Math.round(safeNumber(candidate?.purity, 0)), -3, 3);
  let relation = clamp(Math.round(safeNumber(candidate?.relation, 0)), -3, 3);
  let humanity = clamp(Math.round(safeNumber(candidate?.humanity, 0)), -3, 3);

  const total = Math.abs(truth) + Math.abs(purity) + Math.abs(relation) + Math.abs(humanity);
  if (total > 6 && total > 0) {
    const factor = 6 / total;
    truth = Math.round(truth * factor);
    purity = Math.round(purity * factor);
    relation = Math.round(relation * factor);
    humanity = Math.round(humanity * factor);
  }

  return { truth, purity, relation, humanity };
}

export async function generatePersonalizedEnding(input: EndingInput): Promise<OpenWorldFinalizePayload> {
  const parsed = await callOpenAI(buildEndingPrompt(input), 0.7);
  if (!parsed || typeof parsed !== "object") return fallbackEnding(input);

  const payload = parsed as {
    personalized_ending?: Partial<PersonalizedEnding>;
    llm_explainer?: Partial<LlmExplainer>;
  };
  const ending = payload.personalized_ending;
  const explainer = payload.llm_explainer;

  if (!ending || !isNonEmptyString(ending.title_cn) || !isNonEmptyString(ending.title_en)) {
    return fallbackEnding(input);
  }

  const normalized: OpenWorldFinalizePayload = {
    score: input.score,
    engine_summary: input.engineSummary,
    reason_codes: input.reasonCodes,
    personalized_ending: {
      title_cn: ending.title_cn,
      title_en: ending.title_en,
      epilogue_cn: isNonEmptyString(ending.epilogue_cn) ? ending.epilogue_cn : fallbackEnding(input).personalized_ending.epilogue_cn,
      epilogue_en: isNonEmptyString(ending.epilogue_en) ? ending.epilogue_en : fallbackEnding(input).personalized_ending.epilogue_en,
      ending_tags: Array.isArray(ending.ending_tags)
        ? ending.ending_tags.filter(isNonEmptyString).slice(0, 8)
        : fallbackEnding(input).personalized_ending.ending_tags,
      future_hook_cn: isNonEmptyString(ending.future_hook_cn)
        ? ending.future_hook_cn
        : fallbackEnding(input).personalized_ending.future_hook_cn,
      future_hook_en: isNonEmptyString(ending.future_hook_en)
        ? ending.future_hook_en
        : fallbackEnding(input).personalized_ending.future_hook_en,
    },
    llm_explainer: {
      summary_cn: isNonEmptyString(explainer?.summary_cn)
        ? explainer.summary_cn
        : "LLM 已参与评分解释并生成个性化终章。",
      summary_en: isNonEmptyString(explainer?.summary_en)
        ? explainer.summary_en
        : "The LLM contributed score interpretation and generated a personalized epilogue.",
      score_delta: normalizeScoreDelta(explainer?.score_delta),
    },
  };

  return normalized;
}
