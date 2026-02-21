use anchor_lang::prelude::*;

pub const CH1_NIGHT_DINNER: u8 = 1;
pub const CH2_MEMORY_TRADE: u8 = 2;
pub const CH3_ROOFTOP_COLLAPSE: u8 = 3;

pub const C1_N1_OPENING_PROBE: u8 = 11;
pub const C1_N2_PRIVATE_PROOF: u8 = 12;
pub const C1_N3_LAST_CALL_PRESSURE: u8 = 13;
pub const C2_N1_TERMS_EXCHANGE: u8 = 21;
pub const C2_N2_FOOTPRINT_SWAP: u8 = 22;
pub const C2_N3_KILLER_REVEAL_GATE: u8 = 23;
pub const C2_N4_SECRET_PACT: u8 = 24;
pub const C3_N1_SYSTEM_BREAKDOWN: u8 = 31;
pub const C3_N2_FINAL_CHOICE: u8 = 32;
pub const C3_N3_ENDING_RESOLVE: u8 = 33;

pub const PACT_COMMIT: u8 = 1;
pub const PACT_DELAY: u8 = 2;
pub const PACT_BACKDOOR: u8 = 3;
pub const END_BURY_TRUTH: u8 = 11;
pub const END_DISCLOSE: u8 = 12;
pub const END_DOUBLE_PLAY: u8 = 13;

pub const SILK_BURIAL_TRUE: u8 = 1;
pub const BROKEN_OATH: u8 = 2;
pub const FRAMED_AND_JAILED: u8 = 3;

pub fn truth_unlocked(dignity_score: u8, relation_score: i8, pollution_flag: bool, c2_n3_passed: bool) -> bool {
    dignity_score >= 70 && relation_score >= 1 && !pollution_flag && c2_n3_passed
}

pub fn stable_cooperation_path(
    final_decision_code: u8,
    dignity_score: u8,
    relation_score: i8,
    pollution_flag: bool,
) -> bool {
    final_decision_code == END_BURY_TRUTH && dignity_score >= 70 && relation_score >= 2 && !pollution_flag
}

pub fn resolve_ending_code(
    final_decision_code: u8,
    dignity_score: u8,
    relation_score: i8,
    pollution_flag: bool,
) -> u8 {
    if stable_cooperation_path(final_decision_code, dignity_score, relation_score, pollution_flag) {
        return SILK_BURIAL_TRUE;
    }

    if pollution_flag || relation_score <= 0 {
        return FRAMED_AND_JAILED;
    }

    if final_decision_code == END_DISCLOSE {
        return BROKEN_OATH;
    }

    BROKEN_OATH
}

#[event]
pub struct InterrogationTurnCommittedEvent {
    pub chapter: u8,
    pub node_id: u8,
    pub choice_id: u8,
    pub suspicion_cost: u64,
    pub budget_left_bps: u16,
    pub relation_delta: i8,
    pub pollution_flag: bool,
}

#[event]
pub struct ChapterDecisionCommittedEvent {
    pub chapter: u8,
    pub node_id: u8,
    pub decision_code: u8,
    pub relation_after: i8,
    pub truth_progress: u8,
}

#[event]
pub struct SessionFinalizedEvent {
    pub ending_code: u8,
    pub final_dignity: u8,
    pub humanity_score: u8,
    pub relation_final: i8,
    pub truth_unlocked: bool,
    pub framed_flag: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hide_sis_codes_are_frozen() {
        assert_eq!(CH1_NIGHT_DINNER, 1);
        assert_eq!(CH2_MEMORY_TRADE, 2);
        assert_eq!(CH3_ROOFTOP_COLLAPSE, 3);
        assert_eq!(C1_N1_OPENING_PROBE, 11);
        assert_eq!(C1_N2_PRIVATE_PROOF, 12);
        assert_eq!(C1_N3_LAST_CALL_PRESSURE, 13);
        assert_eq!(C2_N1_TERMS_EXCHANGE, 21);
        assert_eq!(C2_N2_FOOTPRINT_SWAP, 22);
        assert_eq!(C2_N3_KILLER_REVEAL_GATE, 23);
        assert_eq!(C2_N4_SECRET_PACT, 24);
        assert_eq!(C3_N1_SYSTEM_BREAKDOWN, 31);
        assert_eq!(C3_N2_FINAL_CHOICE, 32);
        assert_eq!(C3_N3_ENDING_RESOLVE, 33);
        assert_eq!(PACT_COMMIT, 1);
        assert_eq!(PACT_DELAY, 2);
        assert_eq!(PACT_BACKDOOR, 3);
        assert_eq!(END_BURY_TRUTH, 11);
        assert_eq!(END_DISCLOSE, 12);
        assert_eq!(END_DOUBLE_PLAY, 13);
        assert_eq!(SILK_BURIAL_TRUE, 1);
        assert_eq!(BROKEN_OATH, 2);
        assert_eq!(FRAMED_AND_JAILED, 3);
    }

    #[test]
    fn truth_gate_boundaries_match_spec() {
        assert!(!truth_unlocked(69, 1, false, true));
        assert!(!truth_unlocked(70, 0, false, true));
        assert!(!truth_unlocked(70, 1, true, true));
        assert!(!truth_unlocked(70, 1, false, false));
        assert!(truth_unlocked(70, 1, false, true));
    }

    #[test]
    fn ending_resolution_handles_happy_and_edge_paths() {
        assert_eq!(resolve_ending_code(END_BURY_TRUTH, 70, 2, false), SILK_BURIAL_TRUE);
        assert_eq!(resolve_ending_code(END_DISCLOSE, 90, 2, false), BROKEN_OATH);
        assert_eq!(resolve_ending_code(END_DOUBLE_PLAY, 90, 2, true), FRAMED_AND_JAILED);
        assert_eq!(resolve_ending_code(END_DISCLOSE, 90, 0, false), FRAMED_AND_JAILED);
        assert_eq!(resolve_ending_code(END_BURY_TRUTH, 69, 2, false), BROKEN_OATH);
    }
}

