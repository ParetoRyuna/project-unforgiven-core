import type { RiskSignal } from '@/services/fan-pass-hub/src/types';

export type LabEntryType = 'story' | 'case' | 'daily_log' | 'pressure_event';
export type LabScenarioType = 'narrative' | 'pressure_sim' | 'live_shadow';
export type LabConsentMode = 'diegetic_opt_in' | 'summary_only';

export type LabEntryDifficulty = 'low' | 'medium' | 'high';

export type LabManifestEntry = {
  entry_type: LabEntryType;
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: 'draft' | 'ready' | 'published' | 'archived';
  path: string;
  content_label: 'story' | 'case' | 'daily_log' | 'pressure_event';
  difficulty: LabEntryDifficulty;
};

export type LabManifest = {
  schema_version: 1;
  updated_at: number;
  entries: LabManifestEntry[];
};

export type StoryQuizOption = {
  id: number;
  label: string;
};

export type StoryQuiz = {
  question: string;
  options: StoryQuizOption[];
  correct_option_id: number;
  success_ending: string;
  failure_ending: string;
};

export type NarrativeQuiz = StoryQuiz;

export type StoryEpisodeCompiled = {
  schema_version: 1;
  entry_type: 'story';
  id: string;
  slug: string;
  series_id: string;
  episode_id: string;
  title: string;
  subtitle?: string;
  teaser_only: boolean;
  consent_hint?: string;
  paragraphs: string[];
  quiz: StoryQuiz;
};

export type PressureEventSource = {
  schema_version: 1;
  entry_type: 'pressure_event';
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  countdown_ms: number;
  slot_limit: number;
  queue_window_ms: number;
  click_window_good_ms: number;
  consent_hint?: string;
};

export type CaseSource = {
  schema_version: 1;
  entry_type: 'case';
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  status: 'draft' | 'ready' | 'published' | 'archived';
  consent_hint?: string;
  prompt: string;
  clues?: string[];
  quiz: NarrativeQuiz;
};

export type DailyLogSource = {
  schema_version: 1;
  entry_type: 'daily_log';
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  status?: 'draft' | 'ready' | 'published' | 'archived';
  consent_hint?: string;
  paragraphs?: string[];
  quiz?: NarrativeQuiz;
};

export type LabEntryPayload = StoryEpisodeCompiled | PressureEventSource | CaseSource | DailyLogSource;

export type TelemetrySummaryV1 = {
  schema_version: 1;
  scenario_type: LabScenarioType;
  session_id: string;
  story_id?: string;
  case_id?: string;
  event_id?: string;
  reading_time_ms?: number;
  progress_ratio?: number;
  scroll_entropy?: number;
  focus_blur_count?: number;
  input_latency_ms?: number;
  retry_count?: number;
  queue_wait_ms?: number;
  countdown_to_click_ms?: number;
  quiz_correct?: boolean;
  quiz_answer_id?: number;
  consent_mode?: LabConsentMode;
  client_ts?: number;
  telemetry_hash?: string;
};

export type LabSession = {
  session_id: string;
  entry_type: LabEntryType;
  entry_id: string;
  entry_slug: string;
  scenario_type: LabScenarioType;
  wallet: string;
  consent_mode: LabConsentMode;
  shadow_mode_enabled: true;
  started_at: number;
  updated_at: number;
  telemetry_latest: TelemetrySummaryV1 | null;
  telemetry_history_count: number;
  challenge_submission_count: number;
};

export type ModelLayerBreakdown = {
  base_human_score: number;
  pressure_behavior_score: number;
  graph_risk_score: number;
};

export type ShadowScoringResult = {
  local_decision: 'allow' | 'step_up' | 'block';
  human_confidence: number;
  sample_eligible: boolean;
  reason_codes: string[];
  risk_signals: RiskSignal[];
  model_layer_breakdown: ModelLayerBreakdown;
};

export type LabChallengeSubmitInput = {
  session_id: string;
  entry_type: LabEntryType;
  entry_id: string;
  answer?: Record<string, unknown>;
  telemetry_summary?: TelemetrySummaryV1;
};

export type LabChallengeUnlockResult = {
  status: 'success' | 'failure';
  correct?: boolean;
  message: string;
};

export type LabChallengeSubmitResult = {
  session: LabSession;
  unlock_result: LabChallengeUnlockResult;
  shadow_decision: 'allow' | 'step_up' | 'block';
  human_confidence: number;
  reason_codes: string[];
  would_step_up: boolean;
  would_block: boolean;
  sample_eligible: boolean;
  model_layer_breakdown: ModelLayerBreakdown;
  hub_decision_snapshot: {
    decision: 'allow' | 'step_up' | 'block';
    tier: 'verified' | 'guest' | 'bot_suspected';
    reason_codes: string[];
  } | null;
};

export type LabShadowRecord = {
  record_id: string;
  session_id: string;
  entry_type: LabEntryType;
  entry_id: string;
  scenario_type: LabScenarioType;
  decision_shadow: 'allow' | 'step_up' | 'block';
  would_block: boolean;
  would_step_up: boolean;
  human_confidence: number;
  model_layer_breakdown: ModelLayerBreakdown;
  reason_codes: string[];
  sample_eligible: boolean;
  label_status: 'unknown' | 'human_likely' | 'bot_likely' | 'confirmed_reviewed';
  review_notes?: string;
  telemetry_summary: TelemetrySummaryV1 | null;
  created_at: number;
};
