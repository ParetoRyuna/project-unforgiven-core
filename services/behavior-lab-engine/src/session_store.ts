import { randomUUID } from 'crypto';

import { Keypair } from '@solana/web3.js';

import { quoteHubDecision } from '@/services/fan-pass-hub/src/decision_engine';

import { findLabEntryById, getLabEntryPayload } from './catalog.ts';
import { scoreNarrativeShadow, scorePressureShadow } from './scoring.ts';
import type {
  CaseSource,
  DailyLogSource,
  LabChallengeSubmitInput,
  LabChallengeSubmitResult,
  LabConsentMode,
  LabEntryType,
  LabSession,
  LabShadowRecord,
  PressureEventSource,
  StoryEpisodeCompiled,
  TelemetrySummaryV1,
} from './types.ts';

export type StartLabSessionInput = {
  entry_type: LabEntryType;
  entry_id: string;
  consent_mode: LabConsentMode;
  wallet?: string;
};

export type IngestLabTelemetryInput = {
  session_id: string;
  telemetry_summary: TelemetrySummaryV1;
};

type SessionInternal = LabSession & {
  telemetry_history: TelemetrySummaryV1[];
  latest_shadow_record_id: string | null;
};

type LabState = {
  sessions: Map<string, SessionInternal>;
  shadow_records: LabShadowRecord[];
};

const GLOBAL_KEY = '__wanwanBehaviorLabStateV1';

function getState(): LabState {
  const globalRef = globalThis as typeof globalThis & { [GLOBAL_KEY]?: LabState };
  if (!globalRef[GLOBAL_KEY]) {
    globalRef[GLOBAL_KEY] = { sessions: new Map<string, SessionInternal>(), shadow_records: [] };
  }
  return globalRef[GLOBAL_KEY] as LabState;
}

function now(): number {
  return Date.now();
}

function toScenarioType(entryType: LabEntryType): LabSession['scenario_type'] {
  return entryType === 'pressure_event' ? 'pressure_sim' : 'narrative';
}

function makePseudoWallet(): string {
  return Keypair.generate().publicKey.toBase58();
}

function publicSessionShape(session: SessionInternal): LabSession {
  return {
    session_id: session.session_id,
    entry_type: session.entry_type,
    entry_id: session.entry_id,
    entry_slug: session.entry_slug,
    scenario_type: session.scenario_type,
    wallet: session.wallet,
    consent_mode: session.consent_mode,
    shadow_mode_enabled: true,
    started_at: session.started_at,
    updated_at: session.updated_at,
    telemetry_latest: session.telemetry_latest,
    telemetry_history_count: session.telemetry_history.length,
    challenge_submission_count: session.challenge_submission_count,
  };
}

function getSessionOrThrow(sessionId: string): SessionInternal {
  const session = getState().sessions.get(sessionId);
  if (!session) throw new Error('lab session not found');
  return session;
}

function normalizeTelemetry(input: TelemetrySummaryV1, expectedSessionId: string): TelemetrySummaryV1 {
  const out: TelemetrySummaryV1 = {
    schema_version: 1,
    scenario_type: input.scenario_type,
    session_id: expectedSessionId,
  };

  const passthroughKeys: (keyof TelemetrySummaryV1)[] = [
    'story_id',
    'case_id',
    'event_id',
    'quiz_correct',
    'quiz_answer_id',
    'consent_mode',
    'client_ts',
    'telemetry_hash',
  ];
  for (const key of passthroughKeys) {
    if (input[key] !== undefined) (out as Record<string, unknown>)[key] = input[key];
  }

  const nonNegativeFields: (keyof TelemetrySummaryV1)[] = [
    'reading_time_ms',
    'scroll_entropy',
    'focus_blur_count',
    'input_latency_ms',
    'retry_count',
    'queue_wait_ms',
  ];
  for (const key of nonNegativeFields) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = Math.max(0, key.includes('count') ? Math.floor(value) : value);
    }
  }

  if (typeof input.progress_ratio === 'number' && Number.isFinite(input.progress_ratio)) {
    out.progress_ratio = Math.max(0, Math.min(1, input.progress_ratio));
  }
  if (typeof input.countdown_to_click_ms === 'number' && Number.isFinite(input.countdown_to_click_ms)) {
    out.countdown_to_click_ms = input.countdown_to_click_ms;
  }

  return out;
}

function mergeTelemetry(a: TelemetrySummaryV1 | null, b: TelemetrySummaryV1 | undefined): TelemetrySummaryV1 | null {
  if (!a && !b) return null;
  if (!a && b) return b;
  if (a && !b) return a;
  return {
    ...(a as TelemetrySummaryV1),
    ...(b as TelemetrySummaryV1),
    schema_version: 1,
    session_id: (b as TelemetrySummaryV1).session_id || (a as TelemetrySummaryV1).session_id,
  };
}

export function startLabSession(input: StartLabSessionInput): { session: LabSession; entry: ReturnType<typeof getLabEntryPayload> } {
  const entryMeta = findLabEntryById(input.entry_type, input.entry_id);
  if (!entryMeta) {
    throw new Error('lab entry not found');
  }
  const payload = getLabEntryPayload(input.entry_type, input.entry_id);
  if (!payload) {
    throw new Error('lab entry payload not found');
  }

  const ts = now();
  const sessionId = `lab-${randomUUID()}`;
  const session: SessionInternal = {
    session_id: sessionId,
    entry_type: input.entry_type,
    entry_id: input.entry_id,
    entry_slug: entryMeta.slug,
    scenario_type: toScenarioType(input.entry_type),
    wallet: input.wallet || makePseudoWallet(),
    consent_mode: input.consent_mode,
    shadow_mode_enabled: true,
    started_at: ts,
    updated_at: ts,
    telemetry_latest: null,
    telemetry_history: [],
    telemetry_history_count: 0,
    challenge_submission_count: 0,
    latest_shadow_record_id: null,
  };

  getState().sessions.set(sessionId, session);
  return { session: publicSessionShape(session), entry: payload };
}

export function ingestLabTelemetry(input: IngestLabTelemetryInput): { session: LabSession; telemetry_summary: TelemetrySummaryV1 } {
  const session = getSessionOrThrow(input.session_id);
  const telemetry = normalizeTelemetry(input.telemetry_summary, session.session_id);
  if (telemetry.scenario_type !== session.scenario_type) {
    throw new Error('telemetry scenario_type does not match session');
  }

  session.telemetry_history.push(telemetry);
  session.telemetry_latest = telemetry;
  session.telemetry_history_count = session.telemetry_history.length;
  session.updated_at = now();

  return { session: publicSessionShape(session), telemetry_summary: telemetry };
}

function evaluateStoryUnlock(story: StoryEpisodeCompiled, answer: Record<string, unknown> | undefined) {
  const optionId = Number(answer?.option_id);
  const correct = Number.isFinite(optionId) && optionId === story.quiz.correct_option_id;
  return {
    correct,
    answerId: Number.isFinite(optionId) ? optionId : undefined,
    result: {
      status: correct ? ('success' as const) : ('failure' as const),
      correct,
      message: correct ? story.quiz.success_ending : story.quiz.failure_ending,
    },
  };
}

function evaluateNarrativeQuizUnlock(
  input: {
    correctOptionId: number;
    successMessage: string;
    failureMessage: string;
  },
  answer: Record<string, unknown> | undefined,
) {
  const optionId = Number(answer?.option_id);
  const correct = Number.isFinite(optionId) && optionId === input.correctOptionId;
  return {
    correct,
    answerId: Number.isFinite(optionId) ? optionId : undefined,
    result: {
      status: correct ? ('success' as const) : ('failure' as const),
      correct,
      message: correct ? input.successMessage : input.failureMessage,
    },
  };
}

function evaluateCaseUnlock(entry: CaseSource, answer: Record<string, unknown> | undefined) {
  return evaluateNarrativeQuizUnlock(
    {
      correctOptionId: entry.quiz.correct_option_id,
      successMessage: entry.quiz.success_ending,
      failureMessage: entry.quiz.failure_ending,
    },
    answer,
  );
}

function evaluateDailyLogUnlock(entry: DailyLogSource, answer: Record<string, unknown> | undefined) {
  const quiz = entry.quiz;
  if (!quiz) {
    return {
      correct: true,
      answerId: undefined,
      result: {
        status: 'success' as const,
        correct: true,
        message: '日志已阅读并记录（Shadow Mode）。',
      },
    };
  }
  return evaluateNarrativeQuizUnlock(
    {
      correctOptionId: quiz.correct_option_id,
      successMessage: quiz.success_ending,
      failureMessage: quiz.failure_ending,
    },
    answer,
  );
}

function evaluatePressureUnlock(event: PressureEventSource, telemetry: TelemetrySummaryV1 | null) {
  const delta = telemetry?.countdown_to_click_ms;
  const retryCount = telemetry?.retry_count ?? 0;
  const inGoodWindow = typeof delta === 'number' && delta >= 0 && delta <= event.click_window_good_ms;
  const success = inGoodWindow && retryCount <= 4;
  return {
    result: {
      status: success ? ('success' as const) : ('failure' as const),
      message: success
        ? '名额窗口命中（Shadow Mode 评分已记录，未执行拦截）。'
        : '你错过了优质窗口，但 Shadow Mode 仍记录了这次尝试。',
    },
  };
}

export async function submitLabChallenge(input: LabChallengeSubmitInput): Promise<LabChallengeSubmitResult> {
  const session = getSessionOrThrow(input.session_id);
  if (session.entry_type !== input.entry_type || session.entry_id !== input.entry_id) {
    throw new Error('entry mismatch with session');
  }

  const payload = getLabEntryPayload(session.entry_type, session.entry_id);
  if (!payload) throw new Error('lab entry payload not found');

  const normalizedTelemetry = input.telemetry_summary
    ? normalizeTelemetry(input.telemetry_summary, session.session_id)
    : undefined;
  const telemetry = mergeTelemetry(session.telemetry_latest, normalizedTelemetry);

  if (normalizedTelemetry) {
    session.telemetry_history.push(normalizedTelemetry);
    session.telemetry_latest = telemetry;
    session.telemetry_history_count = session.telemetry_history.length;
  }

  let unlockResult: LabChallengeSubmitResult['unlock_result'];
  let localScore;

  if (payload.entry_type === 'story') {
    const unlock = evaluateStoryUnlock(payload, input.answer);
    unlockResult = unlock.result;
    const telemetryWithQuiz: TelemetrySummaryV1 | null = telemetry
      ? { ...telemetry, quiz_correct: unlock.correct, quiz_answer_id: unlock.answerId }
      : null;
    localScore = scoreNarrativeShadow({ telemetry: telemetryWithQuiz, quizCorrect: unlock.correct });
    session.telemetry_latest = telemetryWithQuiz;
  } else if (payload.entry_type === 'case') {
    const unlock = evaluateCaseUnlock(payload, input.answer);
    unlockResult = unlock.result;
    const telemetryWithQuiz: TelemetrySummaryV1 | null = telemetry
      ? { ...telemetry, quiz_correct: unlock.correct, quiz_answer_id: unlock.answerId }
      : null;
    localScore = scoreNarrativeShadow({ telemetry: telemetryWithQuiz, quizCorrect: unlock.correct });
    session.telemetry_latest = telemetryWithQuiz;
  } else if (payload.entry_type === 'daily_log') {
    const unlock = evaluateDailyLogUnlock(payload, input.answer);
    unlockResult = unlock.result;
    const telemetryWithQuiz: TelemetrySummaryV1 | null = telemetry
      ? { ...telemetry, quiz_correct: unlock.correct, quiz_answer_id: unlock.answerId }
      : null;
    localScore = scoreNarrativeShadow({ telemetry: telemetryWithQuiz, quizCorrect: unlock.correct });
    session.telemetry_latest = telemetryWithQuiz;
  } else if (payload.entry_type === 'pressure_event') {
    const unlock = evaluatePressureUnlock(payload, telemetry);
    unlockResult = unlock.result;
    localScore = scorePressureShadow({ event: payload, telemetry });
  } else {
    throw new Error('unsupported lab entry type');
  }

  let hubQuote: Awaited<ReturnType<typeof quoteHubDecision>> | null = null;
  try {
    hubQuote = await quoteHubDecision({
      wallet: session.wallet,
      action_type: 'task_complete',
      asset_id: session.entry_id,
      context: {
        channel: 'wanwan_lab',
        campaign_id: 'lab_mvp_shadow',
        metadata: {
          scenario_type: session.scenario_type,
          scenario_id: session.entry_id,
          telemetry_schema_version: 1,
          telemetry_summary: session.telemetry_latest,
          shadow_mode: true,
          content_label: session.entry_type,
        },
      },
      proofs: [],
      risk_signals: localScore.risk_signals,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'lab_hub_quote_failed',
        session_id: session.session_id,
        entry_id: session.entry_id,
        error: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }

  const shadowDecision = hubQuote?.decision ?? localScore.local_decision;
  const wouldBlock = shadowDecision === 'block';
  const wouldStepUp = shadowDecision === 'step_up';

  session.challenge_submission_count += 1;
  session.updated_at = now();

  const shadowRecord: LabShadowRecord = {
    record_id: `shadow-${randomUUID()}`,
    session_id: session.session_id,
    entry_type: session.entry_type,
    entry_id: session.entry_id,
    scenario_type: session.scenario_type,
    decision_shadow: shadowDecision,
    would_block: wouldBlock,
    would_step_up: wouldStepUp,
    human_confidence: localScore.human_confidence,
    model_layer_breakdown: localScore.model_layer_breakdown,
    reason_codes: [...new Set([...(localScore.reason_codes ?? []), ...(hubQuote?.reason_codes ?? [])])],
    sample_eligible: localScore.sample_eligible,
    label_status: localScore.human_confidence >= 80 ? 'human_likely' : localScore.human_confidence < 35 ? 'bot_likely' : 'unknown',
    telemetry_summary: session.telemetry_latest,
    created_at: now(),
  };
  getState().shadow_records.push(shadowRecord);
  session.latest_shadow_record_id = shadowRecord.record_id;

  console.info(
    JSON.stringify({
      event: 'lab_shadow_recorded',
      session_id: session.session_id,
      entry_id: session.entry_id,
      scenario_type: session.scenario_type,
      decision_shadow: shadowRecord.decision_shadow,
      human_confidence: shadowRecord.human_confidence,
      reason_codes: shadowRecord.reason_codes,
      sample_eligible: shadowRecord.sample_eligible,
    }),
  );

  return {
    session: publicSessionShape(session),
    unlock_result: unlockResult,
    shadow_decision: shadowDecision,
    human_confidence: localScore.human_confidence,
    reason_codes: shadowRecord.reason_codes,
    would_step_up: wouldStepUp,
    would_block: wouldBlock,
    sample_eligible: localScore.sample_eligible,
    model_layer_breakdown: localScore.model_layer_breakdown,
    hub_decision_snapshot: hubQuote
      ? {
          decision: hubQuote.decision,
          tier: hubQuote.tier,
          reason_codes: hubQuote.reason_codes,
        }
      : null,
  };
}

export function listShadowRecords(): LabShadowRecord[] {
  return [...getState().shadow_records];
}
