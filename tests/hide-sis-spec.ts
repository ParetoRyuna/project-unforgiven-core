import { expect } from "chai";

import { HIDE_SIS_FRONTEND_ID_MAP } from "../app/hide-sis/mappings.ts";
import { HIDE_SIS_API_CODEBOOK } from "../app/api/hide-sis/dto.ts";
import {
  CHAPTER_CODES,
  DECISION_CODES,
  ENDING_CODES,
  HIDE_SIS_CANONICAL_CODES,
  NODE_CODES,
  evaluateEndingCode,
  evaluateTruthUnlocked,
} from "../packages/universal-shield-sdk/src/hide_sis_types.ts";
import { replaySession } from "../services/hide-sis-engine/src/state_machine.ts";

const EXPECTED_CODEBOOK = {
  chapter: {
    CH1_NIGHT_DINNER: 1,
    CH2_MEMORY_TRADE: 2,
    CH3_ROOFTOP_COLLAPSE: 3,
  },
  node: {
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
  },
  decision: {
    PACT_COMMIT: 1,
    PACT_DELAY: 2,
    PACT_BACKDOOR: 3,
    END_BURY_TRUTH: 11,
    END_DISCLOSE: 12,
    END_DOUBLE_PLAY: 13,
  },
  ending: {
    SILK_BURIAL_TRUE: 1,
    BROKEN_OATH: 2,
    FRAMED_AND_JAILED: 3,
  },
  userMode: {
    BOT_SUSPECTED: 0,
    GUEST: 1,
    VERIFIED: 2,
  },
};

describe("Hide & Sis v0.1 codebook and state machine", () => {
  it("keeps the shared numeric codebook frozen across frontend and API DTO", () => {
    expect(HIDE_SIS_CANONICAL_CODES).to.deep.equal(EXPECTED_CODEBOOK);
    expect(HIDE_SIS_FRONTEND_ID_MAP.codes).to.deep.equal(EXPECTED_CODEBOOK);
    expect(HIDE_SIS_API_CODEBOOK).to.deep.equal(EXPECTED_CODEBOOK);
  });

  it("enforces truth gate thresholds on D=69/70 and T=-1/0 boundaries", () => {
    expect(
      evaluateTruthUnlocked({
        dignity_score: 69,
        relation_score: 1,
        pollution_flag: false,
        c2_n3_passed: true,
      }),
    ).to.equal(false);

    expect(
      evaluateTruthUnlocked({
        dignity_score: 70,
        relation_score: -1,
        pollution_flag: false,
        c2_n3_passed: true,
      }),
    ).to.equal(false);

    expect(
      evaluateTruthUnlocked({
        dignity_score: 70,
        relation_score: 0,
        pollution_flag: false,
        c2_n3_passed: true,
      }),
    ).to.equal(true);
  });

  it("resolves all three endings with happy and edge paths", () => {
    const silk = evaluateEndingCode({
      final_decision_code: DECISION_CODES.END_BURY_TRUTH,
      dignity_score: 70,
      relation_score: 2,
      pollution_flag: false,
    });
    expect(silk).to.equal(ENDING_CODES.SILK_BURIAL_TRUE);

    const broken = evaluateEndingCode({
      final_decision_code: DECISION_CODES.END_DISCLOSE,
      dignity_score: 90,
      relation_score: 2,
      pollution_flag: false,
    });
    expect(broken).to.equal(ENDING_CODES.BROKEN_OATH);

    const framedByPollution = evaluateEndingCode({
      final_decision_code: DECISION_CODES.END_DOUBLE_PLAY,
      dignity_score: 90,
      relation_score: 2,
      pollution_flag: true,
    });
    expect(framedByPollution).to.equal(ENDING_CODES.FRAMED_AND_JAILED);

    const framedByRelation = evaluateEndingCode({
      final_decision_code: DECISION_CODES.END_DISCLOSE,
      dignity_score: 90,
      relation_score: 0,
      pollution_flag: false,
    });
    expect(framedByRelation).to.equal(ENDING_CODES.FRAMED_AND_JAILED);
  });

  it("replays a session deterministically from event history", () => {
    const state = replaySession({
      initial_dignity_score: 72,
      events: [
        {
          kind: "turn",
          event: {
            chapter: CHAPTER_CODES.CH1_NIGHT_DINNER,
            node_id: NODE_CODES.C1_N3_LAST_CALL_PRESSURE,
            choice_id: 1,
            suspicion_cost: 100,
            budget_left_bps: 8000,
            relation_delta: 1,
            pollution_flag: false,
          },
        },
        {
          kind: "turn",
          event: {
            chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
            node_id: NODE_CODES.C2_N3_KILLER_REVEAL_GATE,
            choice_id: 1,
            suspicion_cost: 120,
            budget_left_bps: 7200,
            relation_delta: 0,
            pollution_flag: false,
          },
        },
        {
          kind: "decision",
          event: {
            chapter: CHAPTER_CODES.CH2_MEMORY_TRADE,
            node_id: NODE_CODES.C2_N4_SECRET_PACT,
            decision_code: DECISION_CODES.PACT_COMMIT,
            relation_after: 2,
            truth_progress: 85,
          },
        },
        {
          kind: "decision",
          event: {
            chapter: CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE,
            node_id: NODE_CODES.C3_N2_FINAL_CHOICE,
            decision_code: DECISION_CODES.END_BURY_TRUTH,
            relation_after: 2,
            truth_progress: 100,
          },
        },
      ],
    });

    expect(state.truth_unlocked).to.equal(true);
    expect(state.c2_n3_passed).to.equal(true);
    expect(state.ending_code).to.equal(ENDING_CODES.SILK_BURIAL_TRUE);
    expect(state.last_chapter).to.equal(CHAPTER_CODES.CH3_ROOFTOP_COLLAPSE);
    expect(state.seen_nodes).to.include(NODE_CODES.C2_N3_KILLER_REVEAL_GATE);
  });
});
