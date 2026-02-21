import {
  CHAPTER_CODES,
  DECISION_CODES,
  ENDING_CODES,
  NODE_CODES,
  USER_MODE_CODES,
  isStableCooperationPath,
  type ChapterCode,
  type DecisionCode,
  type EndingCode,
  type NodeCode,
  type UserModeCode,
  evaluateEndingCode,
  evaluateTruthUnlocked,
} from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";
import type {
  ChapterDecisionCommittedEvent,
  InterrogationTurnCommittedEvent,
  SessionFinalizedEvent,
} from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";

type NodeChoice = {
  id: number;
  label: string;
  relationDelta: number;
  pollutionRisk: boolean;
  dignityDelta?: number;
  decisionCode?: DecisionCode;
  markRevealPassed?: boolean;
};

type NodeSpec = {
  id: NodeCode;
  chapter: ChapterCode;
  title: string;
  prompt: string;
  interrogative: boolean;
  choices: NodeChoice[];
};

type QuoteResult = {
  blocked: boolean;
  suspicion_cost: number;
  budget_cost_bps: number;
  budget_left_bps_after: number;
};

export type EndingBreakdown = {
  truth_gate: {
    d_ok: boolean;
    t_ok: boolean;
    pollution_ok: boolean;
    reveal_ok: boolean;
  };
  ending_gate: {
    decision_code: DecisionCode;
    stable_path_ok: boolean;
    framed_triggered: boolean;
  };
  reason_codes: string[];
  hint_cn: string;
  hint_en: string;
};

export type HideSisSession = {
  sessionId: string;
  wallet: string;
  userMode: UserModeCode;
  dignityScore: number;
  relationScore: number;
  pollutionScore: number;
  pollutionFlag: boolean;
  c2n3Passed: boolean;
  truthUnlocked: boolean;
  currentNodeId: NodeCode;
  completed: boolean;
  finalDecisionCode: DecisionCode | null;
  endingCode: EndingCode | null;
  chapterBudgetBps: Record<number, number>;
  nodeAttemptCounter: Record<number, number>;
  verifiedFootprints: Record<string, boolean>;
  turnEvents: InterrogationTurnCommittedEvent[];
  decisionEvents: ChapterDecisionCommittedEvent[];
  finalizedEvent: SessionFinalizedEvent | null;
  finalizedBreakdown: EndingBreakdown | null;
  startedAt: number;
  updatedAt: number;
};

export type SessionStartInput = {
  wallet?: string;
  mode?: "verified" | "guest" | "bot_suspected";
};

export type SessionCommitInput = {
  sessionId: string;
  choiceId: number;
};

const GLOBAL_STORE_KEY = "__hideSisSessionsV1";
const globalRef = globalThis as typeof globalThis & {
  [GLOBAL_STORE_KEY]?: Map<string, HideSisSession>;
};
const sessions = globalRef[GLOBAL_STORE_KEY] ?? new Map<string, HideSisSession>();
globalRef[GLOBAL_STORE_KEY] = sessions;

const nodeFlow: Record<number, NodeCode | null> = {
  [NODE_CODES.C1_N1_OPENING_PROBE]: NODE_CODES.C1_N2_PRIVATE_PROOF,
  [NODE_CODES.C1_N2_PRIVATE_PROOF]: NODE_CODES.C1_N3_LAST_CALL_PRESSURE,
  [NODE_CODES.C1_N3_LAST_CALL_PRESSURE]: NODE_CODES.C2_N1_TERMS_EXCHANGE,
  [NODE_CODES.C2_N1_TERMS_EXCHANGE]: NODE_CODES.C2_N2_FOOTPRINT_SWAP,
  [NODE_CODES.C2_N2_FOOTPRINT_SWAP]: NODE_CODES.C2_N3_KILLER_REVEAL_GATE,
  [NODE_CODES.C2_N3_KILLER_REVEAL_GATE]: NODE_CODES.C2_N4_SECRET_PACT,
  [NODE_CODES.C2_N4_SECRET_PACT]: NODE_CODES.C3_N1_SYSTEM_BREAKDOWN,
  [NODE_CODES.C3_N1_SYSTEM_BREAKDOWN]: NODE_CODES.C3_N2_FINAL_CHOICE,
  [NODE_CODES.C3_N2_FINAL_CHOICE]: NODE_CODES.C3_N3_ENDING_RESOLVE,
  [NODE_CODES.C3_N3_ENDING_RESOLVE]: null,
};

const story: Record<number, NodeSpec> = {
  [NODE_CODES.C1_N1_OPENING_PROBE]: {
    id: NODE_CODES.C1_N1_OPENING_PROBE,
    chapter: CHAPTER_CODES.CH1_NIGHT_DINNER,
    title: "Opening Probe",
    prompt: "Picha smiles first. Every word sounds gentle, every pause feels like a trap.",
    interrogative: true,
    choices: [
      { id: 1, label: "Push back directly", relationDelta: -1, pollutionRisk: true },
      { id: 2, label: "Deflect with grace", relationDelta: 1, pollutionRisk: false },
      { id: 3, label: "Stay silent and watch", relationDelta: 0, pollutionRisk: false },
    ],
  },
  [NODE_CODES.C1_N2_PRIVATE_PROOF]: {
    id: NODE_CODES.C1_N2_PRIVATE_PROOF,
    chapter: CHAPTER_CODES.CH1_NIGHT_DINNER,
    title: "Private Proof",
    prompt: "Picha asks for no details. She only asks for a verifiable green light.",
    interrogative: true,
    choices: [
      { id: 1, label: "Submit private proof", relationDelta: 1, pollutionRisk: false, dignityDelta: 4 },
      { id: 2, label: "Delay and stall", relationDelta: -1, pollutionRisk: true, dignityDelta: -3 },
    ],
  },
  [NODE_CODES.C1_N3_LAST_CALL_PRESSURE]: {
    id: NODE_CODES.C1_N3_LAST_CALL_PRESSURE,
    chapter: CHAPTER_CODES.CH1_NIGHT_DINNER,
    title: "Last Call Pressure",
    prompt: "Chatfah's final call becomes a blade. You can push once. Twice has a cost.",
    interrogative: true,
    choices: [
      { id: 1, label: "Question once", relationDelta: 0, pollutionRisk: false },
      { id: 2, label: "Force second push", relationDelta: -1, pollutionRisk: true },
      { id: 3, label: "Stop here", relationDelta: 1, pollutionRisk: false },
    ],
  },
  [NODE_CODES.C2_N1_TERMS_EXCHANGE]: {
    id: NODE_CODES.C2_N1_TERMS_EXCHANGE,
    chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
    title: "Terms Exchange",
    prompt: "One memory for one truth fragment. Picha lets you pick the order.",
    interrogative: true,
    choices: [
      { id: 1, label: "Offer memory first", relationDelta: 1, pollutionRisk: false },
      { id: 2, label: "Demand proof first", relationDelta: 0, pollutionRisk: false },
      { id: 3, label: "Emotional pressure", relationDelta: -1, pollutionRisk: true },
    ],
  },
  [NODE_CODES.C2_N2_FOOTPRINT_SWAP]: {
    id: NODE_CODES.C2_N2_FOOTPRINT_SWAP,
    chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
    title: "Footprint Swap",
    prompt: "Your lived traces become keys. Each verified trace can buy one shard of truth.",
    interrogative: true,
    choices: [
      { id: 1, label: "Verify Spotify trace", relationDelta: 0, pollutionRisk: false, dignityDelta: 3 },
      { id: 2, label: "Verify GitHub trace", relationDelta: 0, pollutionRisk: false, dignityDelta: 4 },
      { id: 3, label: "Verify Twitter trace", relationDelta: 0, pollutionRisk: false, dignityDelta: 3 },
    ],
  },
  [NODE_CODES.C2_N3_KILLER_REVEAL_GATE]: {
    id: NODE_CODES.C2_N3_KILLER_REVEAL_GATE,
    chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
    title: "Reveal Gate",
    prompt: "If trust, proof, and composure hold, Picha gives the real answer: she did it.",
    interrogative: true,
    choices: [
      { id: 1, label: "Ask softly, no accusation", relationDelta: 1, pollutionRisk: false, markRevealPassed: true },
      { id: 2, label: "Accuse and corner", relationDelta: -1, pollutionRisk: true },
      { id: 3, label: "Pretend to trust and probe", relationDelta: 0, pollutionRisk: false, markRevealPassed: true },
    ],
  },
  [NODE_CODES.C2_N4_SECRET_PACT]: {
    id: NODE_CODES.C2_N4_SECRET_PACT,
    chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
    title: "Secret Pact",
    prompt: "Picha asks one clear question: with me, or with the record?",
    interrogative: false,
    choices: [
      { id: 1, label: "Commit to share the secret", relationDelta: 1, pollutionRisk: false, decisionCode: DECISION_CODES.PACT_COMMIT },
      { id: 2, label: "Delay commitment", relationDelta: 0, pollutionRisk: false, decisionCode: DECISION_CODES.PACT_DELAY },
      { id: 3, label: "Keep a backdoor", relationDelta: -1, pollutionRisk: true, decisionCode: DECISION_CODES.PACT_BACKDOOR },
    ],
  },
  [NODE_CODES.C3_N1_SYSTEM_BREAKDOWN]: {
    id: NODE_CODES.C3_N1_SYSTEM_BREAKDOWN,
    chapter: CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE,
    title: "System Breakdown",
    prompt: "On the rooftop, the family machine cracks. Time pressure multiplies every choice.",
    interrogative: true,
    choices: [
      { id: 1, label: "Protect Picha and hold line", relationDelta: 1, pollutionRisk: false },
      { id: 2, label: "Try to save both sides", relationDelta: 0, pollutionRisk: true },
      { id: 3, label: "Cut and retreat", relationDelta: -1, pollutionRisk: true },
    ],
  },
  [NODE_CODES.C3_N2_FINAL_CHOICE]: {
    id: NODE_CODES.C3_N2_FINAL_CHOICE,
    chapter: CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE,
    title: "Final Choice",
    prompt: "Bury truth, disclose truth, or play both. Only one path stays stable.",
    interrogative: false,
    choices: [
      { id: 1, label: "Bury truth together", relationDelta: 1, pollutionRisk: false, decisionCode: DECISION_CODES.END_BURY_TRUTH },
      { id: 2, label: "Disclose the truth", relationDelta: -1, pollutionRisk: false, decisionCode: DECISION_CODES.END_DISCLOSE },
      { id: 3, label: "Play both sides", relationDelta: -1, pollutionRisk: true, decisionCode: DECISION_CODES.END_DOUBLE_PLAY },
    ],
  },
  [NODE_CODES.C3_N3_ENDING_RESOLVE]: {
    id: NODE_CODES.C3_N3_ENDING_RESOLVE,
    chapter: CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE,
    title: "Ending Resolve",
    prompt: "No more questions. Only consequence.",
    interrogative: false,
    choices: [{ id: 1, label: "Finalize fate", relationDelta: 0, pollutionRisk: false }],
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nowMs(): number {
  return Date.now();
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMode(mode?: "verified" | "guest" | "bot_suspected"): UserModeCode {
  switch (mode) {
    case "guest":
      return USER_MODE_CODES.GUEST;
    case "bot_suspected":
      return USER_MODE_CODES.BOT_SUSPECTED;
    default:
      return USER_MODE_CODES.VERIFIED;
  }
}

function defaultDignityByMode(mode: UserModeCode): number {
  if (mode === USER_MODE_CODES.BOT_SUSPECTED) return 20;
  if (mode === USER_MODE_CODES.GUEST) return 50;
  return 72;
}

function currentNode(session: HideSisSession): NodeSpec {
  const node = story[session.currentNodeId];
  if (!node) throw new Error("current node not found");
  return node;
}

function quoteNode(session: HideSisSession): QuoteResult {
  const node = currentNode(session);
  const chapterBudget = session.chapterBudgetBps[node.chapter] ?? 0;
  const attempts = (session.nodeAttemptCounter[node.id] ?? 0) + 1;

  if (!node.interrogative) {
    return {
      blocked: false,
      suspicion_cost: 80_000,
      budget_cost_bps: 200,
      budget_left_bps_after: clamp(chapterBudget - 200, 0, 10_000),
    };
  }

  const chapterHeat = node.chapter === CHAPTER_CODES.CH1_NIGHT_DINNER ? 1.0 : node.chapter === CHAPTER_CODES.CH2_MEMORY_TRADE ? 1.2 : 1.45;
  const dignityHeatFactor = 1 + (100 - session.dignityScore) / 140;
  const attemptFactor = Math.pow(1.45, attempts - 1);
  const base = 650;
  const rawCost = Math.round(base * chapterHeat * dignityHeatFactor * attemptFactor);
  const budgetCostBps = clamp(Math.round(rawCost * 1.35), 300, 7_500);
  const budgetLeftAfter = chapterBudget - budgetCostBps;

  return {
    blocked: budgetLeftAfter <= 0,
    suspicion_cost: rawCost * 1_000,
    budget_cost_bps: budgetCostBps,
    budget_left_bps_after: clamp(budgetLeftAfter, 0, 10_000),
  };
}

function applyFootprintDignity(session: HideSisSession, node: NodeSpec, choice: NodeChoice): number {
  if (node.id !== NODE_CODES.C2_N2_FOOTPRINT_SWAP) {
    return choice.dignityDelta ?? 0;
  }

  const footprintKey = choice.id === 1 ? "spotify" : choice.id === 2 ? "github" : "twitter";
  if (session.verifiedFootprints[footprintKey]) return 0;
  session.verifiedFootprints[footprintKey] = true;
  return choice.dignityDelta ?? 0;
}

function computePollutionDelta(params: { quoteBlocked: boolean; choice: NodeChoice; dignityDelta: number }): number {
  let delta = 0;

  if (params.quoteBlocked) delta += 2;
  if (params.choice.pollutionRisk) delta += 1;

  const restorative =
    !params.choice.pollutionRisk &&
    (params.choice.relationDelta >= 0 ||
      params.dignityDelta > 0 ||
      params.choice.markRevealPassed === true ||
      params.choice.decisionCode === DECISION_CODES.PACT_COMMIT ||
      params.choice.decisionCode === DECISION_CODES.END_BURY_TRUTH);

  if (restorative) {
    const strongCleanse =
      params.choice.markRevealPassed === true ||
      params.choice.decisionCode === DECISION_CODES.PACT_COMMIT ||
      params.choice.decisionCode === DECISION_CODES.END_BURY_TRUTH;
    delta -= strongCleanse ? 3 : 1;
  }
  return delta;
}

function computeTruthUnlocked(session: HideSisSession): boolean {
  return evaluateTruthUnlocked({
    dignity_score: session.dignityScore,
    relation_score: session.relationScore,
    pollution_flag: session.pollutionFlag,
    c2_n3_passed: session.c2n3Passed,
  });
}

function buildEndingBreakdown(
  session: HideSisSession,
  ending: EndingCode,
  decisionCode: DecisionCode,
): EndingBreakdown {
  const truthGate = {
    d_ok: session.dignityScore >= 70,
    t_ok: session.relationScore >= 0,
    pollution_ok: !session.pollutionFlag,
    reveal_ok: session.c2n3Passed,
  };

  const stablePathOk = isStableCooperationPath({
    final_decision_code: decisionCode,
    dignity_score: session.dignityScore,
    relation_score: session.relationScore,
    pollution_flag: session.pollutionFlag,
  });

  const reasonCodes: string[] = [];
  if (!truthGate.d_ok) reasonCodes.push("DIGNITY_LOW");
  if (!truthGate.t_ok) reasonCodes.push("RELATION_LOW");
  if (!truthGate.pollution_ok) reasonCodes.push("POLLUTION_LOCKED");
  if (!truthGate.reveal_ok) reasonCodes.push("REVEAL_MISSED");
  if (ending === ENDING_CODES.FRAMED_AND_JAILED) reasonCodes.push("FRAMED_AND_JAILED");
  if (ending === ENDING_CODES.BROKEN_OATH) reasonCodes.push("OATH_BROKEN");
  if (ending === ENDING_CODES.SILK_BURIAL_TRUE) reasonCodes.push("SILK_BURIAL_TRUE");

  let hintCn = "保持关系值与清洁路径，才能进入稳定共谋结局。";
  let hintEn = "Keep relation and a clean path to unlock the stable conspiracy ending.";
  if (!truthGate.reveal_ok) {
    hintCn = "第2章揭露门必须通过：在 C2-N3 选择温和追问。";
    hintEn = "Pass the reveal gate in Chapter 2: choose the soft probe in C2-N3.";
  } else if (!truthGate.pollution_ok) {
    hintCn = "尽量避免高风险选项，污染会直接压向坏结局。";
    hintEn = "Avoid high-risk choices; pollution strongly pushes toward the bad ending.";
  } else if (!truthGate.t_ok) {
    hintCn = "多选信任和共担选项，把关系值提升到 0 以上。";
    hintEn = "Pick trust/co-op choices and push relation above 0.";
  } else if (!truthGate.d_ok) {
    hintCn = "补足足迹验证并提交私密证明，把尊严分拉到 70。";
    hintEn = "Complete footprint checks and private proof to reach dignity 70.";
  }

  return {
    truth_gate: truthGate,
    ending_gate: {
      decision_code: decisionCode,
      stable_path_ok: stablePathOk,
      framed_triggered: ending === ENDING_CODES.FRAMED_AND_JAILED,
    },
    reason_codes: reasonCodes,
    hint_cn: hintCn,
    hint_en: hintEn,
  };
}

function serializeSession(session: HideSisSession) {
  const node = currentNode(session);
  return {
    session_id: session.sessionId,
    wallet: session.wallet,
    user_mode: session.userMode,
    dignity_score: session.dignityScore,
    relation_score: session.relationScore,
    pollution_score: session.pollutionScore,
    pollution_flag: session.pollutionFlag,
    c2_n3_passed: session.c2n3Passed,
    truth_unlocked: session.truthUnlocked,
    completed: session.completed,
    chapter_budget_bps: session.chapterBudgetBps,
    current_node: {
      id: node.id,
      chapter: node.chapter,
      title: node.title,
      prompt: node.prompt,
      choices: node.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    },
    final_decision_code: session.finalDecisionCode,
    ending_code: session.endingCode,
    turn_events: session.turnEvents,
    decision_events: session.decisionEvents,
    finalized_event: session.finalizedEvent,
    ending_breakdown: session.finalizedBreakdown,
  };
}

export function startSession(input: SessionStartInput) {
  const mode = normalizeMode(input.mode);
  const session: HideSisSession = {
    sessionId: randomId(),
    wallet: input.wallet ?? `guest-${randomId()}`,
    userMode: mode,
    dignityScore: defaultDignityByMode(mode),
    relationScore: 0,
    pollutionScore: 0,
    pollutionFlag: false,
    c2n3Passed: false,
    truthUnlocked: false,
    currentNodeId: NODE_CODES.C1_N1_OPENING_PROBE,
    completed: false,
    finalDecisionCode: null,
    endingCode: null,
    chapterBudgetBps: {
      [CHAPTER_CODES.CH1_NIGHT_DINNER]: 10_000,
      [CHAPTER_CODES.CH2_MEMORY_TRADE]: 10_000,
      [CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE]: 10_000,
    },
    nodeAttemptCounter: {},
    verifiedFootprints: {},
    turnEvents: [],
    decisionEvents: [],
    finalizedEvent: null,
    finalizedBreakdown: null,
    startedAt: nowMs(),
    updatedAt: nowMs(),
  };

  sessions.set(session.sessionId, session);
  return serializeSession(session);
}

export function getSession(sessionId: string): HideSisSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("session not found");
  if (typeof session.pollutionScore !== "number") {
    session.pollutionScore = session.pollutionFlag ? 1 : 0;
  }
  return session;
}

export function quoteTurn(sessionId: string) {
  const session = getSession(sessionId);
  if (session.completed) throw new Error("session already finalized");

  const node = currentNode(session);
  const quote = quoteNode(session);

  return {
    session_id: session.sessionId,
    chapter: node.chapter,
    node_id: node.id,
    blocked: quote.blocked,
    suspicion_cost: quote.suspicion_cost.toString(),
    budget_cost_bps: quote.budget_cost_bps,
    budget_left_bps_after: quote.budget_left_bps_after,
  };
}

export function commitTurn(input: SessionCommitInput) {
  const session = getSession(input.sessionId);
  if (session.completed) throw new Error("session already finalized");

  const node = currentNode(session);
  const choice = node.choices.find((item) => item.id === input.choiceId);
  if (!choice) throw new Error("invalid choice id for current node");

  const quote = quoteNode(session);
  const preRelationScore = session.relationScore;
  session.nodeAttemptCounter[node.id] = (session.nodeAttemptCounter[node.id] ?? 0) + 1;

  session.chapterBudgetBps[node.chapter] = quote.budget_left_bps_after;
  session.relationScore = clamp(session.relationScore + choice.relationDelta, -3, 3);
  const dignityDelta = applyFootprintDignity(session, node, choice);
  session.dignityScore = clamp(session.dignityScore + dignityDelta, 0, 100);

  const pollutionDelta = computePollutionDelta({
    quoteBlocked: quote.blocked,
    choice,
    dignityDelta,
  });
  session.pollutionScore = clamp(session.pollutionScore + pollutionDelta, 0, 3);
  session.pollutionFlag = session.pollutionScore >= 2;
  const eventPollution = pollutionDelta > 0;
  const revealEligible =
    choice.markRevealPassed ||
    (node.id === NODE_CODES.C2_N3_KILLER_REVEAL_GATE && choice.id === 2 && preRelationScore >= 3);
  if (revealEligible) session.c2n3Passed = true;

  const turnEvent: InterrogationTurnCommittedEvent = {
    chapter: node.chapter,
    node_id: node.id,
    choice_id: choice.id,
    suspicion_cost: quote.suspicion_cost,
    budget_left_bps: quote.budget_left_bps_after,
    relation_delta: choice.relationDelta,
    pollution_flag: eventPollution,
  };
  session.turnEvents.push(turnEvent);

  if (choice.decisionCode != null) {
    const decisionEvent: ChapterDecisionCommittedEvent = {
      chapter: node.chapter,
      node_id: node.id,
      decision_code: choice.decisionCode,
      relation_after: session.relationScore,
      truth_progress: session.truthUnlocked ? 100 : clamp(Math.round((session.dignityScore + (session.relationScore + 3) * 8) / 1.6), 0, 99),
    };
    session.decisionEvents.push(decisionEvent);

    if (
      choice.decisionCode === DECISION_CODES.END_BURY_TRUTH ||
      choice.decisionCode === DECISION_CODES.END_DISCLOSE ||
      choice.decisionCode === DECISION_CODES.END_DOUBLE_PLAY
    ) {
      session.finalDecisionCode = choice.decisionCode;
    }
  }

  session.truthUnlocked = computeTruthUnlocked(session);

  const nextNode = nodeFlow[node.id];
  if (nextNode != null) {
    session.currentNodeId = nextNode;
  }
  session.updatedAt = nowMs();

  return {
    quote: {
      blocked: quote.blocked,
      suspicion_cost: quote.suspicion_cost.toString(),
      budget_cost_bps: quote.budget_cost_bps,
    },
    session: serializeSession(session),
    ready_to_finalize: session.currentNodeId === NODE_CODES.C3_N3_ENDING_RESOLVE && session.finalDecisionCode != null,
  };
}

export function finalizeSession(sessionId: string) {
  const session = getSession(sessionId);
  if (session.completed && session.finalizedEvent && session.finalizedBreakdown) {
    return {
      session: serializeSession(session),
      finalized_event: session.finalizedEvent,
      ending_breakdown: session.finalizedBreakdown,
    };
  }

  if (session.finalDecisionCode == null) {
    throw new Error("final decision not committed");
  }

  const ending = evaluateEndingCode({
    final_decision_code: session.finalDecisionCode,
    dignity_score: session.dignityScore,
    relation_score: session.relationScore,
    pollution_flag: session.pollutionFlag,
  });
  const breakdown = buildEndingBreakdown(session, ending, session.finalDecisionCode);

  session.endingCode = ending;
  session.truthUnlocked = computeTruthUnlocked(session);
  const framedFlag = ending === ENDING_CODES.FRAMED_AND_JAILED;
  const humanityScore = clamp(
    50 +
      session.relationScore * 8 +
      (session.truthUnlocked ? 10 : 0) -
      (session.pollutionFlag ? 18 : 0) -
      (framedFlag ? 8 : 0),
    0,
    100,
  );

  const finalizedEvent: SessionFinalizedEvent = {
    ending_code: ending,
    final_dignity: session.dignityScore,
    humanity_score: humanityScore,
    relation_final: session.relationScore,
    truth_unlocked: session.truthUnlocked,
    framed_flag: framedFlag,
  };

  session.finalizedEvent = finalizedEvent;
  session.finalizedBreakdown = breakdown;
  session.completed = true;
  session.updatedAt = nowMs();

  return {
    session: serializeSession(session),
    finalized_event: finalizedEvent,
    ending_breakdown: breakdown,
  };
}
