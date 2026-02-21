export const HIDE_SIS_SCHEMA_VERSION = "v0.1";
export const TARGET_FIRST_CLEAR_TRUTH_RATE = 0.35;

export const CHAPTER_CODES = {
  CH1_NIGHT_DINNER: 1,
  CH2_MEMORY_TRADE: 2,
  CH3_ROOFTOP_COLLAPSE: 3,
} as const;

export const NODE_CODES = {
  C1_N1_OPENING_PROBE: 11,
  C1_N2_PRIVATE_PROOF: 12,
  C1_N3_LAST_CALL_PRESSURE: 13,
  C2_N1_TERMS_EXCHANGE: 21,
  C2_N2_FOOTPRINT_SWAP: 22,
  C2_N3_KILLER_REVEAL_GATE: 23,
  C2_N4_SECRET_PACT: 24,
  C3_N1_SYSTEM_BREAKDOWN: 31,
  C3_N2_FINAL_CHOICE: 32,
  C3_N3_ENDING_RESOLVE: 33,
} as const;

export const DECISION_CODES = {
  PACT_COMMIT: 1,
  PACT_DELAY: 2,
  PACT_BACKDOOR: 3,
  END_BURY_TRUTH: 11,
  END_DISCLOSE: 12,
  END_DOUBLE_PLAY: 13,
} as const;

export const ENDING_CODES = {
  SILK_BURIAL_TRUE: 1,
  BROKEN_OATH: 2,
  FRAMED_AND_JAILED: 3,
} as const;

export const USER_MODE_CODES = {
  BOT_SUSPECTED: 0,
  GUEST: 1,
  VERIFIED: 2,
} as const;

export const HIDE_SIS_CANONICAL_CODES = {
  chapter: CHAPTER_CODES,
  node: NODE_CODES,
  decision: DECISION_CODES,
  ending: ENDING_CODES,
  userMode: USER_MODE_CODES,
} as const;

export type ChapterCode = (typeof CHAPTER_CODES)[keyof typeof CHAPTER_CODES];
export type NodeCode = (typeof NODE_CODES)[keyof typeof NODE_CODES];
export type DecisionCode = (typeof DECISION_CODES)[keyof typeof DECISION_CODES];
export type EndingCode = (typeof ENDING_CODES)[keyof typeof ENDING_CODES];
export type UserModeCode = (typeof USER_MODE_CODES)[keyof typeof USER_MODE_CODES];

export const CHAPTER_LABELS: Record<ChapterCode, string> = {
  [CHAPTER_CODES.CH1_NIGHT_DINNER]: "Chapter 1: Night Dinner",
  [CHAPTER_CODES.CH2_MEMORY_TRADE]: "Chapter 2: Memory Trade",
  [CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE]: "Chapter 3: Rooftop Collapse",
};

export const NODE_LABELS: Record<NodeCode, string> = {
  [NODE_CODES.C1_N1_OPENING_PROBE]: "C1-N1 Opening Probe",
  [NODE_CODES.C1_N2_PRIVATE_PROOF]: "C1-N2 Private Proof",
  [NODE_CODES.C1_N3_LAST_CALL_PRESSURE]: "C1-N3 Last Call Pressure",
  [NODE_CODES.C2_N1_TERMS_EXCHANGE]: "C2-N1 Terms Exchange",
  [NODE_CODES.C2_N2_FOOTPRINT_SWAP]: "C2-N2 Footprint Swap",
  [NODE_CODES.C2_N3_KILLER_REVEAL_GATE]: "C2-N3 Killer Reveal Gate",
  [NODE_CODES.C2_N4_SECRET_PACT]: "C2-N4 Secret Pact",
  [NODE_CODES.C3_N1_SYSTEM_BREAKDOWN]: "C3-N1 System Breakdown",
  [NODE_CODES.C3_N2_FINAL_CHOICE]: "C3-N2 Final Choice",
  [NODE_CODES.C3_N3_ENDING_RESOLVE]: "C3-N3 Ending Resolve",
};

export const ENDING_LABELS: Record<EndingCode, string> = {
  [ENDING_CODES.SILK_BURIAL_TRUE]: "Silk Burial (True)",
  [ENDING_CODES.BROKEN_OATH]: "Broken Oath",
  [ENDING_CODES.FRAMED_AND_JAILED]: "Framed and Jailed",
};

export type InterrogationTurnCommittedEvent = {
  chapter: ChapterCode;
  node_id: NodeCode;
  choice_id: number; // u8
  suspicion_cost: number; // u64
  budget_left_bps: number; // u16
  relation_delta: number; // i8
  pollution_flag: boolean;
};

export type ChapterDecisionCommittedEvent = {
  chapter: ChapterCode;
  node_id: NodeCode;
  decision_code: DecisionCode;
  relation_after: number; // i8
  truth_progress: number; // u8
};

export type SessionFinalizedEvent = {
  ending_code: EndingCode;
  final_dignity: number; // u8
  humanity_score: number; // u8
  relation_final: number; // i8
  truth_unlocked: boolean;
  framed_flag: boolean;
};

export type TruthGateInput = {
  dignity_score: number;
  relation_score: number;
  pollution_flag: boolean;
  c2_n3_passed: boolean;
};

export type EndingGateInput = {
  final_decision_code: DecisionCode;
  dignity_score: number;
  relation_score: number;
  pollution_flag: boolean;
};

export const KILLER_REVEAL_NODE = NODE_CODES.C2_N3_KILLER_REVEAL_GATE;

export function evaluateTruthUnlocked(input: TruthGateInput): boolean {
  return input.dignity_score >= 70 && input.relation_score >= 0 && !input.pollution_flag && input.c2_n3_passed;
}

export function isStableCooperationPath(input: EndingGateInput): boolean {
  return (
    input.final_decision_code === DECISION_CODES.END_BURY_TRUTH &&
    input.dignity_score >= 70 &&
    input.relation_score >= 2 &&
    !input.pollution_flag
  );
}

export function evaluateEndingCode(input: EndingGateInput): EndingCode {
  if (isStableCooperationPath(input)) {
    return ENDING_CODES.SILK_BURIAL_TRUE;
  }

  if (input.pollution_flag || input.relation_score <= 0) {
    return ENDING_CODES.FRAMED_AND_JAILED;
  }

  if (input.final_decision_code === DECISION_CODES.END_DISCLOSE) {
    return ENDING_CODES.BROKEN_OATH;
  }

  return ENDING_CODES.BROKEN_OATH;
}
