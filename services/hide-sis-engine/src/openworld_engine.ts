import type {
  Action,
  ActionPreview,
  Clue,
  Guidance,
  OpenWorldFinalizePayload,
  ScoreBreakdown,
  SessionClock,
  SessionPhase,
  Location,
  NPC,
  PlayerState,
  ScenePayload,
  WorldSeed,
  WorldState,
} from "../../../packages/universal-shield-sdk/src/hide_sis_openworld_types";
import { buildFallbackScene, generatePersonalizedEnding, generateScenePayload } from "./openworld_llm.ts";

type OpenWorldSession = {
  worldSeed: WorldSeed;
  worldState: WorldState;
  playerState: PlayerState;
  completed: boolean;
  finalized: OpenWorldFinalizePayload | null;
  lastScene: ScenePayload | null;
  updatedAt: number;
  timeSpent: number;
  actionCountByKey: Record<string, number>;
  actionTrace: string[];
  usedClueByNpc: Record<string, number>;
  usedClueAny: boolean;
  resolutionConfirmed: boolean;
  lieCount: number;
  allyCount: number;
  restCount: number;
};

type StartInput = {
  theme_prompt: string;
  genre_tags?: string[];
  constraints?: string[];
};

type ActionInput = {
  world_id: string;
  action: Action;
};

const OPENWORLD_STORE_KEY = "__hideSisOpenWorldV3";
const TIME_BUDGET = 100;
const RULEBOOK = [
  "每次行动都会消耗时间，时间耗尽自动结算。",
  "同目标重复行动会衰减收益，乱点会明显掉分。",
  "中后期必须用线索佐证核心证词，否则真相分会卡住。",
];

const ACTION_TIME_COST: Record<Action["type"], number> = {
  MOVE: 12,
  INTERROGATE: 14,
  SEARCH: 10,
  USE_CLUE: 16,
  LIE: 8,
  ALLY: 12,
  REST: 9,
};

const globalRef = globalThis as typeof globalThis & {
  [OPENWORLD_STORE_KEY]?: Map<string, OpenWorldSession>;
};
const sessions = globalRef[OPENWORLD_STORE_KEY] ?? new Map<string, OpenWorldSession>();
globalRef[OPENWORLD_STORE_KEY] = sessions;

const BASE_LOCATIONS = [
  { name: "旧宅正厅", tags: ["manor", "ritual"] },
  { name: "档案冷库", tags: ["memory", "records"] },
  { name: "风暴天台", tags: ["rooftop", "collapse"] },
  { name: "侧厅花园", tags: ["garden", "whisper"] },
  { name: "客房走廊", tags: ["corridor", "echo"] },
];

const BASE_NPCS = [
  { name: "Picha", role: "第三妹" },
  { name: "Baibua", role: "大姐" },
  { name: "Archivist", role: "守档者" },
  { name: "Witness", role: "目击者" },
];

const BASE_CLUES = [
  { label: "破损的戒指", truth: 14, pollution: 1 },
  { label: "断电记录", truth: 12, pollution: 0 },
  { label: "密封短信", truth: 16, pollution: 1 },
  { label: "手写遗嘱", truth: 18, pollution: 0 },
  { label: "血色花瓣", truth: 20, pollution: 1 },
];

function nowMs(): number {
  return Date.now();
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTags(input?: string[]): string[] {
  if (!input || input.length === 0) return ["mystery", "family", "thriller"];
  return input.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

function normalizeConstraints(input?: string[]): string[] {
  if (!input || input.length === 0) return ["no-explicit-era", "emotional-tension", "open-investigation"];
  return input.map((constraint) => constraint.trim().toLowerCase()).filter(Boolean);
}

function buildWorldSeed(input: StartInput): WorldSeed {
  return {
    world_id: randomId("world"),
    theme_prompt: input.theme_prompt?.trim() || "家族迷局",
    genre_tags: normalizeTags(input.genre_tags),
    constraints: normalizeConstraints(input.constraints),
  };
}

function buildLocations(seed: WorldSeed): Location[] {
  return BASE_LOCATIONS.map((loc, idx) => ({
    id: `loc-${idx + 1}`,
    name: loc.name,
    tags: [...loc.tags, ...seed.genre_tags.slice(0, 2)],
    danger: clamp(2 + idx, 1, 5),
  }));
}

function buildNPCs(seed: WorldSeed): NPC[] {
  return BASE_NPCS.map((npc, idx) => ({
    id: `npc-${idx + 1}`,
    name: npc.name,
    role: npc.role,
    secret: `${npc.name} 与 ${seed.theme_prompt} 有未公开的牵连。`,
    relation: idx === 0 ? 1 : 0,
  }));
}

function buildClues(seed: WorldSeed): Clue[] {
  return BASE_CLUES.map((clue, idx) => ({
    id: `clue-${idx + 1}`,
    label: `${clue.label}（${seed.theme_prompt}）`,
    truth_value: clue.truth,
    pollution_risk: clue.pollution,
  }));
}

function buildPlayerState(world: WorldState): PlayerState {
  const relation_map: Record<string, number> = {};
  world.npcs.forEach((npc) => {
    relation_map[npc.id] = npc.relation;
  });
  return {
    current_location: world.locations[0]?.id ?? "loc-1",
    dignity: 70,
    relation_map,
    pollution_score: 0,
    truth_progress: 0,
    inventory: [],
    journal: [
      "你踏入这座世界，第一缕线索在暗处呼吸。",
      "这不是按按钮的游戏，每一步都会改变你的评分命运。",
    ],
  };
}

function buildWorldState(seed: WorldSeed): WorldState {
  return {
    time_tick: 0,
    locations: buildLocations(seed),
    npcs: buildNPCs(seed),
    clues: buildClues(seed),
    heat: 0,
    budget_bps: 10_000,
  };
}

function phaseOf(timeSpent: number): SessionPhase {
  if (timeSpent < 40) return "INVESTIGATION";
  if (timeSpent < 75) return "CORROBORATION";
  return "RESOLUTION";
}

function buildClock(session: OpenWorldSession): SessionClock {
  const left = clamp(TIME_BUDGET - session.timeSpent, 0, TIME_BUDGET);
  return {
    time_budget: TIME_BUDGET,
    time_spent: session.timeSpent,
    time_left: left,
    phase: phaseOf(session.timeSpent),
  };
}

function buildActionKey(action: Action, player: PlayerState): string {
  switch (action.type) {
    case "MOVE":
      return `MOVE:${action.target_id}`;
    case "INTERROGATE":
      return `INTERROGATE:${action.target_id}`;
    case "SEARCH":
      return `SEARCH:${player.current_location}`;
    case "USE_CLUE":
      return `USE_CLUE:${action.target_id}:${action.clue_id}`;
    case "LIE":
      return `LIE:${action.target_id}`;
    case "ALLY":
      return `ALLY:${action.target_id}`;
    case "REST":
      return "REST";
    default:
      return "ACTION";
  }
}

function noveltyMultiplier(session: OpenWorldSession, actionKey: string): number {
  const repeat = session.actionCountByKey[actionKey] ?? 0;
  return 1 / (1 + repeat * 0.6);
}

function registerAction(session: OpenWorldSession, action: Action, actionKey: string) {
  session.actionCountByKey[actionKey] = (session.actionCountByKey[actionKey] ?? 0) + 1;
  session.actionTrace.push(`${action.type}${"target_id" in action ? `:${action.target_id}` : ""}`);
  if (session.actionTrace.length > 120) {
    session.actionTrace = session.actionTrace.slice(-120);
  }
  if (action.type === "LIE") session.lieCount += 1;
  if (action.type === "ALLY") session.allyCount += 1;
  if (action.type === "REST") session.restCount += 1;
}

function nextClue(world: WorldState, player: PlayerState): Clue | null {
  const owned = new Set(player.inventory.map((clue) => clue.id));
  return world.clues.find((clue) => !owned.has(clue.id)) ?? null;
}

function findNpc(world: WorldState, name: string): NPC | undefined {
  const lower = name.toLowerCase();
  return world.npcs.find((npc) => npc.name.toLowerCase().includes(lower));
}

function updateRelation(player: PlayerState, npcId: string, delta: number) {
  player.relation_map[npcId] = clamp((player.relation_map[npcId] ?? 0) + delta, -3, 3);
}

function truthGainAfterPhaseGate(
  session: OpenWorldSession,
  action: Action,
  proposed: number,
): { truthGain: number; reasonCode?: string } {
  let truthGain = proposed;
  const phase = phaseOf(session.timeSpent);
  const picha = findNpc(session.worldState, "picha");
  const baibua = findNpc(session.worldState, "baibua");

  if (phase === "CORROBORATION") {
    if (action.type === "SEARCH") {
      truthGain *= 0.5;
    }
    if (action.type === "INTERROGATE") {
      const used = session.usedClueByNpc[action.target_id] ?? 0;
      if (used <= 0) {
        truthGain = Math.min(truthGain, 2);
        return { truthGain, reasonCode: "CORROBORATION_NEEDS_CLUE" };
      }
    }
  }

  if (phase === "RESOLUTION") {
    const coreIds = [picha?.id, baibua?.id].filter(Boolean) as string[];
    const isCoreInterrogate = action.type === "INTERROGATE" && coreIds.includes(action.target_id);
    const hasAnyClue = session.usedClueAny;
    const hasCoreClue = action.type === "INTERROGATE" && (session.usedClueByNpc[action.target_id] ?? 0) > 0;
    if (!(isCoreInterrogate && hasAnyClue && hasCoreClue)) {
      return { truthGain: 0, reasonCode: "RESOLUTION_GATE_LOCKED" };
    }
    session.resolutionConfirmed = true;
  }

  return { truthGain };
}

function actionTimeCost(action: Action): number {
  return ACTION_TIME_COST[action.type];
}

function applyAction(session: OpenWorldSession, action: Action): { effects: ScenePayload["effects"]; newClues: Clue[]; reasonCodes: string[] } {
  const world = session.worldState;
  const player = session.playerState;
  const actionKey = buildActionKey(action, player);
  const novelty = noveltyMultiplier(session, actionKey);
  const timeCost = actionTimeCost(action);
  const effects: ScenePayload["effects"] = [];
  const newClues: Clue[] = [];
  const reasonCodes: string[] = [];

  const pushEffect = (effect: ScenePayload["effects"][number]) => effects.push(effect);

  world.time_tick += 1;
  world.budget_bps = clamp(world.budget_bps - timeCost * 14, 0, 10_000);
  session.timeSpent = clamp(session.timeSpent + timeCost, 0, TIME_BUDGET);

  switch (action.type) {
    case "MOVE": {
      const target = world.locations.find((loc) => loc.id === action.target_id);
      if (target) {
        player.current_location = target.id;
        world.heat = clamp(world.heat + 2, 0, 120);
        player.journal.push(`你转移到 ${target.name}，脚步声在走廊里回响。`);
        pushEffect({ heat_delta: 2 });
      }
      break;
    }
    case "SEARCH": {
      const clue = nextClue(world, player);
      world.heat = clamp(world.heat + 2, 0, 120);
      if (clue) {
        player.inventory.push(clue);
        newClues.push(clue);
        const proposed = Math.round(clue.truth_value * novelty);
        const gate = truthGainAfterPhaseGate(session, action, proposed);
        player.truth_progress = clamp(player.truth_progress + gate.truthGain, 0, 120);
        player.pollution_score = clamp(player.pollution_score + clue.pollution_risk, 0, 12);
        player.journal.push(`你在 ${player.current_location} 找到线索：${clue.label}。`);
        pushEffect({
          truth_delta: gate.truthGain,
          pollution_delta: clue.pollution_risk,
          heat_delta: 2,
        });
        if (gate.reasonCode) reasonCodes.push(gate.reasonCode);
      } else {
        player.journal.push("你翻遍角落，却只摸到旧灰尘。");
        reasonCodes.push("SEARCH_DEPLETED");
      }
      break;
    }
    case "INTERROGATE": {
      const npc = world.npcs.find((entry) => entry.id === action.target_id);
      if (npc) {
        const relationBefore = player.relation_map[npc.id] ?? 0;
        const relationDelta = relationBefore >= 0 ? 1 : -1;
        updateRelation(player, npc.id, relationDelta);
        const baseTruth = relationBefore >= 1 ? 8 : 5;
        const proposed = Math.round(baseTruth * novelty);
        const gate = truthGainAfterPhaseGate(session, action, proposed);
        player.truth_progress = clamp(player.truth_progress + gate.truthGain, 0, 120);
        world.heat = clamp(world.heat + 4, 0, 120);
        player.journal.push(`你对 ${npc.name} 施压，试图逼出缺失的证词。`);
        pushEffect({
          relation_delta: relationDelta,
          truth_delta: gate.truthGain,
          heat_delta: 4,
        });
        if (gate.reasonCode) reasonCodes.push(gate.reasonCode);
      }
      break;
    }
    case "USE_CLUE": {
      const npc = world.npcs.find((entry) => entry.id === action.target_id);
      const clue = player.inventory.find((entry) => entry.id === action.clue_id);
      if (npc && clue) {
        session.usedClueAny = true;
        session.usedClueByNpc[npc.id] = (session.usedClueByNpc[npc.id] ?? 0) + 1;
        const proposed = Math.round(clue.truth_value * 0.55 * novelty);
        const gate = truthGainAfterPhaseGate(session, action, proposed);
        updateRelation(player, npc.id, 1);
        player.truth_progress = clamp(player.truth_progress + gate.truthGain, 0, 120);
        player.pollution_score = clamp(player.pollution_score - 1, 0, 12);
        world.heat = clamp(world.heat + 1, 0, 120);
        player.journal.push(`你用 ${clue.label} 撬开了 ${npc.name} 的防线。`);
        pushEffect({
          relation_delta: 1,
          truth_delta: gate.truthGain,
          pollution_delta: -1,
          heat_delta: 1,
        });
        if (gate.reasonCode) reasonCodes.push(gate.reasonCode);
      } else {
        reasonCodes.push("INVALID_CLUE_USE");
      }
      break;
    }
    case "LIE": {
      updateRelation(player, action.target_id, -1);
      player.pollution_score = clamp(player.pollution_score + 2, 0, 12);
      world.heat = clamp(world.heat + 4, 0, 120);
      player.journal.push("你选择了谎言，局势短暂有利，但代价更重。");
      pushEffect({ relation_delta: -1, pollution_delta: 2, heat_delta: 4 });
      reasonCodes.push("LIE_USED");
      break;
    }
    case "ALLY": {
      const current = player.relation_map[action.target_id] ?? 0;
      const delta = current >= 0 ? 1 : 0;
      updateRelation(player, action.target_id, delta);
      player.pollution_score = clamp(player.pollution_score - (delta > 0 ? 1 : 0), 0, 12);
      world.heat = clamp(world.heat + 1, 0, 120);
      player.journal.push(delta > 0 ? "盟约达成，局势暂稳。" : "对方保持沉默，盟约未成。");
      pushEffect({ relation_delta: delta, pollution_delta: delta > 0 ? -1 : 0, heat_delta: 1 });
      break;
    }
    case "REST": {
      world.heat = clamp(world.heat - 10, 0, 120);
      player.pollution_score = clamp(player.pollution_score - 1, 0, 12);
      player.journal.push("你停下来整理证据，避免让自己被噪音吞没。");
      pushEffect({ pollution_delta: -1, heat_delta: -10 });
      break;
    }
    default:
      break;
  }

  registerAction(session, action, actionKey);
  if (effects.some((effect) => (effect.relation_delta ?? 0) > 0)) {
    player.dignity = clamp(player.dignity + 1, 0, 100);
  }
  if (effects.some((effect) => (effect.relation_delta ?? 0) < 0)) {
    player.dignity = clamp(player.dignity - 1, 0, 100);
  }

  return { effects, newClues, reasonCodes };
}

function buildChoiceList(world: WorldState, player: PlayerState): ScenePayload["choices"] {
  const choices: ScenePayload["choices"] = [];
  const moveTargets = world.locations.filter((location) => location.id !== player.current_location).slice(0, 3);
  moveTargets.forEach((loc) => {
    choices.push({ id: `MOVE:${loc.id}`, cn: `前往 ${loc.name}`, en: `Move to ${loc.name}`, effect_tag: "move" });
  });
  world.npcs.forEach((npc) => {
    choices.push({ id: `INTERROGATE:${npc.id}`, cn: `审问 ${npc.name}`, en: `Interrogate ${npc.name}`, effect_tag: "interrogate" });
  });
  choices.push({ id: "SEARCH", cn: "搜索当前地点", en: "Search here", effect_tag: "search" });
  choices.push({ id: "REST", cn: "短暂休整", en: "Rest", effect_tag: "rest" });
  return choices;
}

function relationToScore(value: number): number {
  return clamp(Math.round(((value + 3) / 6) * 100), 0, 100);
}

function gradeOf(composite: number): ScoreBreakdown["grade"] {
  if (composite >= 88) return "S";
  if (composite >= 78) return "A";
  if (composite >= 66) return "B";
  if (composite >= 52) return "C";
  return "D";
}

function gradeDistance(a: ScoreBreakdown["grade"], b: ScoreBreakdown["grade"]): number {
  const rank: Record<ScoreBreakdown["grade"], number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  return Math.abs(rank[a] - rank[b]);
}

function computeScore(session: OpenWorldSession): { score: ScoreBreakdown; reasonCodes: string[]; engineSummary: string[] } {
  const world = session.worldState;
  const player = session.playerState;
  const reasonCodes: string[] = [];

  let truth = clamp(Math.round(player.truth_progress), 0, 100);
  if (!session.usedClueAny) {
    truth = clamp(truth - 12, 0, 100);
    reasonCodes.push("NO_CLUE_CORROBORATION");
  }

  const picha = findNpc(world, "picha");
  const baibua = findNpc(world, "baibua");
  const pichaId = picha?.id ?? "";
  const baibuaId = baibua?.id ?? "";
  const coreClueUsed = (session.usedClueByNpc[pichaId] ?? 0) > 0 || (session.usedClueByNpc[baibuaId] ?? 0) > 0;
  if (!coreClueUsed) {
    truth = clamp(truth - 16, 0, 100);
    reasonCodes.push("CORE_TESTIMONY_UNPROVEN");
  }
  if (!session.resolutionConfirmed) {
    truth = clamp(truth - 20, 0, 100);
    reasonCodes.push("RESOLUTION_NOT_CONFIRMED");
  }

  const pollutionNorm = clamp(player.pollution_score * 11, 0, 100);
  let purity = clamp(100 - pollutionNorm, 0, 100);
  if (player.pollution_score >= 6) reasonCodes.push("HIGH_POLLUTION");

  const coreRelations = [pichaId, baibuaId]
    .filter(Boolean)
    .map((id) => relationToScore(player.relation_map[id] ?? 0));
  const otherRelations = world.npcs
    .filter((npc) => npc.id !== pichaId && npc.id !== baibuaId)
    .map((npc) => relationToScore(player.relation_map[npc.id] ?? 0));
  const coreAverage = coreRelations.length > 0 ? coreRelations.reduce((sum, value) => sum + value, 0) / coreRelations.length : 50;
  const otherAverage = otherRelations.length > 0 ? otherRelations.reduce((sum, value) => sum + value, 0) / otherRelations.length : 50;
  let relation = clamp(Math.round(coreAverage * 0.8 + otherAverage * 0.2), 0, 100);

  let humanity = 56;
  humanity += session.allyCount * 6;
  humanity += session.restCount * 3;
  humanity -= session.lieCount * 11;
  humanity -= Math.max(0, world.heat - 65) * 0.6;
  humanity -= Math.max(0, player.pollution_score - 4) * 3;
  humanity = clamp(Math.round(humanity), 0, 100);

  if (world.heat >= 85) {
    relation = clamp(relation - 10, 0, 100);
    humanity = clamp(humanity - 8, 0, 100);
    reasonCodes.push("HEAT_OVERLOAD");
  }

  if (relation < 45) reasonCodes.push("RELATION_COLLAPSED");
  if (humanity < 45) reasonCodes.push("HUMANITY_COMPROMISED");

  const composite = clamp(Math.round(truth * 0.35 + purity * 0.25 + relation * 0.2 + humanity * 0.2), 0, 100);
  const grade = gradeOf(composite);

  const engineSummary = [
    `真相分 ${truth}：${session.resolutionConfirmed ? "关键证词已锁定" : "关键证词未闭环"}`,
    `纯净分 ${purity}：污染指数 ${player.pollution_score}，热度 ${world.heat}`,
    `关系分 ${relation} / 人性分 ${humanity}：谎言 ${session.lieCount} 次，盟约 ${session.allyCount} 次`,
  ];

  return {
    score: { truth, purity, relation, humanity, composite, grade },
    reasonCodes: Array.from(new Set(reasonCodes)),
    engineSummary,
  };
}

function applyLlmAdjustment(
  rawScore: ScoreBreakdown,
  delta: OpenWorldFinalizePayload["llm_explainer"]["score_delta"],
): ScoreBreakdown {
  const adjusted = {
    truth: clamp(rawScore.truth + delta.truth, 0, 100),
    purity: clamp(rawScore.purity + delta.purity, 0, 100),
    relation: clamp(rawScore.relation + delta.relation, 0, 100),
    humanity: clamp(rawScore.humanity + delta.humanity, 0, 100),
    composite: 0,
    grade: rawScore.grade,
  };
  adjusted.composite = clamp(
    Math.round(adjusted.truth * 0.35 + adjusted.purity * 0.25 + adjusted.relation * 0.2 + adjusted.humanity * 0.2),
    0,
    100,
  );
  adjusted.grade = gradeOf(adjusted.composite);
  if (gradeDistance(adjusted.grade, rawScore.grade) > 1) {
    return rawScore;
  }
  return adjusted;
}

function toFinalizePayload(payload: OpenWorldFinalizePayload, adjustedScore: ScoreBreakdown): OpenWorldFinalizePayload {
  return {
    score: adjustedScore,
    engine_summary: payload.engine_summary,
    reason_codes: payload.reason_codes,
    personalized_ending: payload.personalized_ending,
    llm_explainer: payload.llm_explainer,
  };
}

async function finalizeSession(session: OpenWorldSession): Promise<OpenWorldFinalizePayload> {
  if (session.finalized) return session.finalized;
  const { score, reasonCodes, engineSummary } = computeScore(session);
  const generated = await generatePersonalizedEnding({
    worldSeed: session.worldSeed,
    worldState: session.worldState,
    playerState: session.playerState,
    score,
    engineSummary,
    reasonCodes,
    actionTrace: session.actionTrace,
  });
  const adjustedScore = applyLlmAdjustment(score, generated.llm_explainer.score_delta);
  session.finalized = toFinalizePayload(generated, adjustedScore);
  session.completed = true;
  session.updatedAt = nowMs();
  return session.finalized;
}

function buildGuidance(session: OpenWorldSession): Guidance {
  const phase = phaseOf(session.timeSpent);
  const timeLeft = clamp(TIME_BUDGET - session.timeSpent, 0, TIME_BUDGET);
  const player = session.playerState;
  const world = session.worldState;
  const scorePreview = computeScore(session).score;

  if (phase === "INVESTIGATION") {
    return {
      objective_cn: "先铺线索，再问人，避免早期乱点。",
      objective_en: "Collect clues first, then interrogate. Avoid random clicking.",
      next_cn: "搜索当前地点或移动到高危区",
      next_en: "Search current location or move to a high-risk zone",
      reason_cn: `调查期剩余 ${timeLeft}。建议至少拿到 2 条线索。`,
      reason_en: `${timeLeft} time left in investigation. Aim for at least 2 clues.`,
      action_suggested: { type: "SEARCH" },
    };
  }

  if (phase === "CORROBORATION") {
    const core = findNpc(world, "picha") ?? world.npcs[0];
    return {
      objective_cn: "用线索佐证关键证词，否则真相分会被卡住。",
      objective_en: "Corroborate testimony with clues or truth score will stall.",
      next_cn: `对 ${core?.name ?? "目标"} 使用线索`,
      next_en: `Use a clue on ${core?.name ?? "target"}`,
      reason_cn: `预计等级 ${scorePreview.grade}，中期必须完成线索对证。`,
      reason_en: `Projected grade ${scorePreview.grade}. Corroboration is mandatory now.`,
      action_suggested:
        player.inventory.length > 0 && core
          ? { type: "USE_CLUE", target_id: core.id, clue_id: player.inventory[0].id }
          : { type: "SEARCH" },
    };
  }

  const baibua = findNpc(world, "baibua") ?? world.npcs[1];
  return {
    objective_cn: "终局阶段：锁定核心证词并准备结算。",
    objective_en: "Resolution phase: lock core testimony and prepare to finalize.",
    next_cn: `审问 ${baibua?.name ?? "核心角色"}`,
    next_en: `Interrogate ${baibua?.name ?? "core target"}`,
    reason_cn: `剩余时间 ${timeLeft}。若条件齐备可立即结算。`,
    reason_en: `${timeLeft} time left. Finalize early if conditions are met.`,
    action_suggested: baibua ? { type: "INTERROGATE", target_id: baibua.id } : { type: "SEARCH" },
  };
}

function estimateAction(session: OpenWorldSession, action: Action): ActionPreview {
  const key = buildActionKey(action, session.playerState);
  const novelty = noveltyMultiplier(session, key);
  const phase = phaseOf(session.timeSpent);
  const preview: ActionPreview = {
    action_id: key,
    time_cost: actionTimeCost(action),
    expected: {},
  };

  if (action.type === "SEARCH") {
    let truth = Math.round(12 * novelty);
    if (phase === "CORROBORATION") truth = Math.round(truth * 0.5);
    if (phase === "RESOLUTION") truth = 0;
    preview.expected.truth = truth;
    preview.expected.purity = -1;
    return preview;
  }

  if (action.type === "INTERROGATE") {
    let truth = Math.round(7 * novelty);
    if (phase === "CORROBORATION" && (session.usedClueByNpc[action.target_id] ?? 0) <= 0) truth = Math.min(truth, 2);
    if (phase === "RESOLUTION") {
      const isCore = [findNpc(session.worldState, "picha")?.id, findNpc(session.worldState, "baibua")?.id].includes(action.target_id);
      if (!isCore || (session.usedClueByNpc[action.target_id] ?? 0) <= 0) truth = 0;
    }
    preview.expected.truth = truth;
    preview.expected.relation = 1;
    return preview;
  }

  if (action.type === "USE_CLUE") {
    preview.expected.truth = Math.round(6 * novelty);
    preview.expected.relation = 1;
    preview.expected.purity = 1;
    return preview;
  }

  if (action.type === "ALLY") {
    preview.expected.relation = 1;
    preview.expected.humanity = 4;
    return preview;
  }

  if (action.type === "LIE") {
    preview.expected.relation = -1;
    preview.expected.humanity = -8;
    preview.expected.purity = -2;
    return preview;
  }

  if (action.type === "REST") {
    preview.expected.humanity = 2;
    preview.expected.purity = 1;
    return preview;
  }

  return preview;
}

function buildActionPreviewNext(session: OpenWorldSession): ActionPreview[] {
  const previews: ActionPreview[] = [];
  const world = session.worldState;
  const player = session.playerState;
  previews.push(estimateAction(session, { type: "SEARCH" }));
  previews.push(estimateAction(session, { type: "REST" }));
  world.npcs.forEach((npc) => {
    previews.push(estimateAction(session, { type: "INTERROGATE", target_id: npc.id }));
    previews.push(estimateAction(session, { type: "ALLY", target_id: npc.id }));
    previews.push(estimateAction(session, { type: "LIE", target_id: npc.id }));
  });
  const moveTargets = world.locations.filter((location) => location.id !== player.current_location).slice(0, 3);
  moveTargets.forEach((location) => {
    previews.push(estimateAction(session, { type: "MOVE", target_id: location.id }));
  });
  if (player.inventory.length > 0) {
    world.npcs.forEach((npc) => {
      previews.push(
        estimateAction(session, {
          type: "USE_CLUE",
          target_id: npc.id,
          clue_id: player.inventory[0].id,
        }),
      );
    });
  }
  return previews;
}

function ensureSession(worldId: string): OpenWorldSession {
  const session = sessions.get(worldId);
  if (!session) throw new Error("openworld session not found");
  return session;
}

function buildStartPayload(session: OpenWorldSession, scene: ScenePayload) {
  return {
    world_seed: session.worldSeed,
    world_state: session.worldState,
    player_state: session.playerState,
    scene,
    guidance: buildGuidance(session),
    clock: buildClock(session),
    rulebook: RULEBOOK,
    score_preview: computeScore(session).score,
    action_preview_next: buildActionPreviewNext(session),
  };
}

function buildActionPayload(
  session: OpenWorldSession,
  scene: ScenePayload,
  newClues: Clue[],
  reasonCodes: string[],
  finalized?: OpenWorldFinalizePayload,
) {
  const scorePreview = computeScore(session).score;
  return {
    world_seed: session.worldSeed,
    world_state: session.worldState,
    player_state: session.playerState,
    scene,
    new_clues: newClues,
    reason_codes: reasonCodes,
    guidance: buildGuidance(session),
    clock: buildClock(session),
    score_preview: scorePreview,
    action_preview_next: buildActionPreviewNext(session),
    finalized: finalized ?? null,
  };
}

export async function startOpenWorld(input: StartInput) {
  const seed = buildWorldSeed(input);
  const world = buildWorldState(seed);
  const player = buildPlayerState(world);
  const session: OpenWorldSession = {
    worldSeed: seed,
    worldState: world,
    playerState: player,
    completed: false,
    finalized: null,
    lastScene: null,
    updatedAt: nowMs(),
    timeSpent: 0,
    actionCountByKey: {},
    actionTrace: [],
    usedClueByNpc: {},
    usedClueAny: false,
    resolutionConfirmed: false,
    lieCount: 0,
    allyCount: 0,
    restCount: 0,
  };

  const choices = buildChoiceList(world, player);
  const scene =
    (await generateScenePayload({
      worldSeed: seed,
      worldState: world,
      playerState: player,
      action: { type: "REST" },
      choices,
      effects: [{ heat_delta: 0 }],
      opening: true,
    })) ??
    buildFallbackScene({
      worldSeed: seed,
      worldState: world,
      playerState: player,
      action: { type: "REST" },
      choices,
      effects: [{ heat_delta: 0 }],
      opening: true,
    });

  session.lastScene = scene;
  sessions.set(seed.world_id, session);
  return buildStartPayload(session, scene);
}

export async function applyOpenWorldAction(input: ActionInput) {
  const session = ensureSession(input.world_id);
  if (session.completed) {
    const frozenScene =
      session.lastScene ??
      buildFallbackScene({
        worldSeed: session.worldSeed,
        worldState: session.worldState,
        playerState: session.playerState,
        action: input.action,
        choices: buildChoiceList(session.worldState, session.playerState),
        effects: [],
      });
    return buildActionPayload(session, frozenScene, [], ["SESSION_ALREADY_FINALIZED"], session.finalized ?? undefined);
  }

  const result = applyAction(session, input.action);
  const choices = buildChoiceList(session.worldState, session.playerState);
  const scene =
    (await generateScenePayload({
      worldSeed: session.worldSeed,
      worldState: session.worldState,
      playerState: session.playerState,
      action: input.action,
      choices,
      effects: result.effects,
    })) ??
    buildFallbackScene({
      worldSeed: session.worldSeed,
      worldState: session.worldState,
      playerState: session.playerState,
      action: input.action,
      choices,
      effects: result.effects,
    });

  session.lastScene = scene;
  session.updatedAt = nowMs();

  let finalized: OpenWorldFinalizePayload | undefined;
  if (session.timeSpent >= TIME_BUDGET) {
    finalized = await finalizeSession(session);
    result.reasonCodes.push("TIME_BUDGET_EXHAUSTED");
  }

  return buildActionPayload(session, scene, result.newClues, result.reasonCodes, finalized);
}

export async function finalizeOpenWorldSession(worldId: string): Promise<OpenWorldFinalizePayload> {
  const session = ensureSession(worldId);
  return finalizeSession(session);
}
