import {
  DECISION_CODES,
  KILLER_REVEAL_NODE,
  type ChapterCode,
  type ChapterDecisionCommittedEvent,
  type DecisionCode,
  type EndingCode,
  type EndingGateInput,
  type InterrogationTurnCommittedEvent,
  type NodeCode,
  type SessionFinalizedEvent,
  type TruthGateInput,
  evaluateEndingCode,
  evaluateTruthUnlocked,
} from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";

export type ReplayEvent =
  | { kind: "turn"; event: InterrogationTurnCommittedEvent }
  | { kind: "decision"; event: ChapterDecisionCommittedEvent }
  | { kind: "finalize"; event: SessionFinalizedEvent };

export type ReplayState = {
  dignity_score: number;
  relation_score: number;
  pollution_flag: boolean;
  c2_n3_passed: boolean;
  truth_progress: number;
  truth_unlocked: boolean;
  ending_code: EndingCode | null;
  finalized: boolean;
  last_chapter: ChapterCode | null;
  seen_nodes: NodeCode[];
  seen_decisions: DecisionCode[];
};

export type ReplayInput = {
  initial_dignity_score: number;
  initial_relation_score?: number;
  events: ReplayEvent[];
};

export function resolveTruthUnlocked(input: TruthGateInput): boolean {
  return evaluateTruthUnlocked(input);
}

export function resolveEndingCode(input: EndingGateInput): EndingCode {
  return evaluateEndingCode(input);
}

export function replaySession(input: ReplayInput): ReplayState {
  const state: ReplayState = {
    dignity_score: input.initial_dignity_score,
    relation_score: input.initial_relation_score ?? 0,
    pollution_flag: false,
    c2_n3_passed: false,
    truth_progress: 0,
    truth_unlocked: false,
    ending_code: null,
    finalized: false,
    last_chapter: null,
    seen_nodes: [],
    seen_decisions: [],
  };

  for (const item of input.events) {
    if (item.kind === "turn") {
      state.last_chapter = item.event.chapter;
      state.seen_nodes.push(item.event.node_id);
      state.relation_score += item.event.relation_delta;
      state.pollution_flag = state.pollution_flag || item.event.pollution_flag;
      if (item.event.node_id === KILLER_REVEAL_NODE && item.event.choice_id > 0) {
        state.c2_n3_passed = true;
      }
    } else if (item.kind === "decision") {
      state.last_chapter = item.event.chapter;
      state.seen_nodes.push(item.event.node_id);
      state.seen_decisions.push(item.event.decision_code);
      state.relation_score = item.event.relation_after;
      state.truth_progress = Math.max(state.truth_progress, item.event.truth_progress);
      if (item.event.node_id === KILLER_REVEAL_NODE) {
        state.c2_n3_passed = true;
      }
    } else {
      state.ending_code = item.event.ending_code;
      state.finalized = true;
      state.dignity_score = item.event.final_dignity;
      state.relation_score = item.event.relation_final;
      state.truth_unlocked = item.event.truth_unlocked;
      state.pollution_flag = state.pollution_flag || item.event.framed_flag;
    }

    state.truth_unlocked =
      state.truth_unlocked ||
      resolveTruthUnlocked({
        dignity_score: state.dignity_score,
        relation_score: state.relation_score,
        pollution_flag: state.pollution_flag,
        c2_n3_passed: state.c2_n3_passed,
      });
  }

  if (!state.ending_code && state.seen_decisions.length > 0) {
    const finalDecision = state.seen_decisions[state.seen_decisions.length - 1];
    const fallbackDecision =
      finalDecision === DECISION_CODES.END_BURY_TRUTH ||
      finalDecision === DECISION_CODES.END_DISCLOSE ||
      finalDecision === DECISION_CODES.END_DOUBLE_PLAY
        ? finalDecision
        : DECISION_CODES.END_DOUBLE_PLAY;

    state.ending_code = resolveEndingCode({
      final_decision_code: fallbackDecision,
      dignity_score: state.dignity_score,
      relation_score: state.relation_score,
      pollution_flag: state.pollution_flag,
    });
  }

  return state;
}
