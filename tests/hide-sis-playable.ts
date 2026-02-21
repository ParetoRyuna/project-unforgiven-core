import { expect } from "chai";

import { ENDING_CODES } from "../packages/universal-shield-sdk/src/hide_sis_types.ts";
import { commitTurn, finalizeSession, startSession } from "../services/hide-sis-engine/src/session_store.ts";

describe("Hide & Sis playable flow", () => {
  it("plays through all chapters and finalizes a true ending path", () => {
    const started = startSession({ mode: "verified", wallet: "test-wallet" });
    const sid = started.session_id;

    // Chapter 1
    commitTurn({ sessionId: sid, choiceId: 2 });
    commitTurn({ sessionId: sid, choiceId: 1 });
    commitTurn({ sessionId: sid, choiceId: 3 });

    // Chapter 2
    commitTurn({ sessionId: sid, choiceId: 1 });
    commitTurn({ sessionId: sid, choiceId: 2 });
    commitTurn({ sessionId: sid, choiceId: 1 });
    commitTurn({ sessionId: sid, choiceId: 1 });

    // Chapter 3
    commitTurn({ sessionId: sid, choiceId: 1 });
    const finalChoice = commitTurn({ sessionId: sid, choiceId: 1 });

    expect(finalChoice.ready_to_finalize).to.equal(true);

    const finalized = finalizeSession(sid);
    expect(finalized.finalized_event.ending_code).to.equal(ENDING_CODES.SILK_BURIAL_TRUE);
    expect(finalized.finalized_event.truth_unlocked).to.equal(true);
    expect(finalized.ending_breakdown.truth_gate.d_ok).to.equal(true);
    expect(finalized.ending_breakdown.truth_gate.t_ok).to.equal(true);
    expect(finalized.ending_breakdown.truth_gate.reveal_ok).to.equal(true);
    expect(finalized.ending_breakdown.reason_codes).to.include("SILK_BURIAL_TRUE");
    expect(finalized.session.completed).to.equal(true);
  });
});
