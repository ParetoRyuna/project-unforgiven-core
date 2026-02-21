export type WorldSeed = {
  world_id: string;
  theme_prompt: string;
  genre_tags: string[];
  constraints: string[];
};

export type Location = {
  id: string;
  name: string;
  tags: string[];
  danger: number;
};

export type NPC = {
  id: string;
  name: string;
  role: string;
  secret: string;
  relation: number;
};

export type Clue = {
  id: string;
  label: string;
  truth_value: number;
  pollution_risk: number;
};

export type PlayerState = {
  current_location: string;
  dignity: number;
  relation_map: Record<string, number>;
  pollution_score: number;
  truth_progress: number;
  inventory: Clue[];
  journal: string[];
};

export type WorldState = {
  time_tick: number;
  locations: Location[];
  npcs: NPC[];
  clues: Clue[];
  heat: number;
  budget_bps: number;
};

export type Action =
  | { type: "MOVE"; target_id: string }
  | { type: "INTERROGATE"; target_id: string }
  | { type: "SEARCH"; target_id?: string }
  | { type: "USE_CLUE"; target_id: string; clue_id: string }
  | { type: "LIE"; target_id: string }
  | { type: "ALLY"; target_id: string }
  | { type: "REST" };

export type SessionPhase = "INVESTIGATION" | "CORROBORATION" | "RESOLUTION";

export type SessionClock = {
  time_budget: number;
  time_spent: number;
  time_left: number;
  phase: SessionPhase;
};

export type ScoreBreakdown = {
  truth: number;
  purity: number;
  relation: number;
  humanity: number;
  composite: number;
  grade: "S" | "A" | "B" | "C" | "D";
};

export type ActionPreview = {
  action_id: string;
  time_cost: number;
  expected: {
    truth?: number;
    purity?: number;
    relation?: number;
    humanity?: number;
  };
};

export type SceneBeat = {
  speaker: string;
  cn: string;
  en: string;
  emotion: string;
  sfx?: string;
};

export type ScenePayload = {
  beats: SceneBeat[];
  choices: { id: string; cn: string; en: string; effect_tag?: string }[];
  effects: {
    dignity_delta?: number;
    relation_delta?: number;
    pollution_delta?: number;
    truth_delta?: number;
    heat_delta?: number;
  }[];
};

export type Guidance = {
  objective_cn: string;
  objective_en: string;
  next_cn: string;
  next_en: string;
  reason_cn?: string;
  reason_en?: string;
  action_suggested?: Action;
};

export type PersonalizedEnding = {
  title_cn: string;
  title_en: string;
  epilogue_cn: string;
  epilogue_en: string;
  ending_tags: string[];
  future_hook_cn: string;
  future_hook_en: string;
};

export type LlmExplainer = {
  summary_cn: string;
  summary_en: string;
  score_delta: {
    truth: number;
    purity: number;
    relation: number;
    humanity: number;
  };
};

export type OpenWorldFinalizePayload = {
  score: ScoreBreakdown;
  engine_summary: string[];
  reason_codes: string[];
  personalized_ending: PersonalizedEnding;
  llm_explainer: LlmExplainer;
};
