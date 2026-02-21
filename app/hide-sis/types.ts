export type EndingBreakdown = {
  truth_gate: {
    d_ok: boolean;
    t_ok: boolean;
    pollution_ok: boolean;
    reveal_ok: boolean;
  };
  ending_gate: {
    decision_code: number;
    stable_path_ok: boolean;
    framed_triggered: boolean;
  };
  reason_codes: string[];
  hint_cn: string;
  hint_en: string;
};

export type GameSession = {
  session_id: string;
  wallet: string;
  user_mode: number;
  dignity_score: number;
  relation_score: number;
  pollution_score?: number;
  pollution_flag: boolean;
  c2_n3_passed: boolean;
  truth_unlocked: boolean;
  completed: boolean;
  chapter_budget_bps: Record<string, number>;
  current_node: {
    id: number;
    chapter: number;
    title: string;
    prompt: string;
    choices: { id: number; label: string }[];
  };
  final_decision_code: number | null;
  ending_code: number | null;
  ending_breakdown?: EndingBreakdown | null;
  turn_events: {
    chapter: number;
    node_id: number;
    choice_id: number;
    suspicion_cost: number;
    budget_left_bps: number;
    relation_delta: number;
    pollution_flag: boolean;
  }[];
  decision_events: {
    chapter: number;
    node_id: number;
    decision_code: number;
    relation_after: number;
    truth_progress: number;
  }[];
  finalized_event: {
    ending_code: number;
    final_dignity: number;
    humanity_score: number;
    relation_final: number;
    truth_unlocked: boolean;
    framed_flag: boolean;
  } | null;
};

export type QuotePayload = {
  blocked: boolean;
  suspicion_cost: string;
  budget_cost_bps: number;
  budget_left_bps_after: number;
};
