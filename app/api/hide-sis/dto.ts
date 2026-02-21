import {
  CHAPTER_CODES,
  DECISION_CODES,
  ENDING_CODES,
  HIDE_SIS_CANONICAL_CODES,
  NODE_CODES,
  type ChapterCode,
  type DecisionCode,
  type EndingCode,
  type NodeCode,
} from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";

function assertU8(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${name} must be u8`);
  }
}

function assertI8(name: string, value: number): void {
  if (!Number.isInteger(value) || value < -128 || value > 127) {
    throw new Error(`${name} must be i8`);
  }
}

function assertU16(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`${name} must be u16`);
  }
}

function isChapterCode(value: number): value is ChapterCode {
  return Object.values(CHAPTER_CODES).includes(value as ChapterCode);
}

function isNodeCode(value: number): value is NodeCode {
  return Object.values(NODE_CODES).includes(value as NodeCode);
}

function isDecisionCode(value: number): value is DecisionCode {
  return Object.values(DECISION_CODES).includes(value as DecisionCode);
}

function isEndingCode(value: number): value is EndingCode {
  return Object.values(ENDING_CODES).includes(value as EndingCode);
}

export type InterrogationTurnCommittedEventDTO = {
  chapter: ChapterCode;
  node_id: NodeCode;
  choice_id: number; // u8
  suspicion_cost: string; // u64 in decimal string
  budget_left_bps: number; // u16
  relation_delta: number; // i8
  pollution_flag: boolean;
};

export type ChapterDecisionCommittedEventDTO = {
  chapter: ChapterCode;
  node_id: NodeCode;
  decision_code: DecisionCode;
  relation_after: number; // i8
  truth_progress: number; // u8
};

export type SessionFinalizedEventDTO = {
  ending_code: EndingCode;
  final_dignity: number; // u8
  humanity_score: number; // u8
  relation_final: number; // i8
  truth_unlocked: boolean;
  framed_flag: boolean;
};

export const HIDE_SIS_API_CODEBOOK = HIDE_SIS_CANONICAL_CODES;

export function assertInterrogationTurnCommittedEventDTO(input: InterrogationTurnCommittedEventDTO): void {
  if (!isChapterCode(input.chapter)) throw new Error("chapter must be a valid Chapter code");
  if (!isNodeCode(input.node_id)) throw new Error("node_id must be a valid Node code");
  assertU8("choice_id", input.choice_id);
  if (!/^\d+$/.test(input.suspicion_cost)) throw new Error("suspicion_cost must be u64 decimal string");
  assertU16("budget_left_bps", input.budget_left_bps);
  assertI8("relation_delta", input.relation_delta);
}

export function assertChapterDecisionCommittedEventDTO(input: ChapterDecisionCommittedEventDTO): void {
  if (!isChapterCode(input.chapter)) throw new Error("chapter must be a valid Chapter code");
  if (!isNodeCode(input.node_id)) throw new Error("node_id must be a valid Node code");
  if (!isDecisionCode(input.decision_code)) throw new Error("decision_code must be a valid Decision code");
  assertI8("relation_after", input.relation_after);
  assertU8("truth_progress", input.truth_progress);
}

export function assertSessionFinalizedEventDTO(input: SessionFinalizedEventDTO): void {
  if (!isEndingCode(input.ending_code)) throw new Error("ending_code must be a valid Ending code");
  assertU8("final_dignity", input.final_dignity);
  assertU8("humanity_score", input.humanity_score);
  assertI8("relation_final", input.relation_final);
}
