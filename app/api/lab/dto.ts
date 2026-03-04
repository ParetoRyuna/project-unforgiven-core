import { PublicKey } from '@solana/web3.js';

import type {
  LabChallengeSubmitInput,
  LabConsentMode,
  LabEntryType,
  TelemetrySummaryV1,
} from '@/services/behavior-lab-engine/src/types';

export class LabInputValidationError extends Error {}

function asObject(input: unknown, name: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LabInputValidationError(`${name} must be an object`);
  }
  return input as Record<string, unknown>;
}

function asString(input: unknown, name: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new LabInputValidationError(`${name} must be a non-empty string`);
  }
  return input.trim();
}

function asOptionalString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(input: unknown, name: string): number | undefined {
  if (input == null) return undefined;
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new LabInputValidationError(`${name} must be a finite number`);
  }
  return value;
}

function asOptionalBoolean(input: unknown, name: string): boolean | undefined {
  if (input == null) return undefined;
  if (typeof input !== 'boolean') throw new LabInputValidationError(`${name} must be a boolean`);
  return input;
}

const LAB_ENTRY_TYPES: LabEntryType[] = ['story', 'case', 'daily_log', 'pressure_event'];
const CONSENT_MODES: LabConsentMode[] = ['diegetic_opt_in', 'summary_only'];
const SCENARIO_TYPES: TelemetrySummaryV1['scenario_type'][] = ['narrative', 'pressure_sim', 'live_shadow'];

function parseWalletOptional(input: unknown): string | undefined {
  const wallet = asOptionalString(input);
  if (!wallet) return undefined;
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new LabInputValidationError('wallet must be a valid Solana public key');
  }
}

export function parseLabSessionStartBody(body: unknown): {
  entry_type: LabEntryType;
  entry_id: string;
  consent_mode: LabConsentMode;
  wallet?: string;
} {
  const obj = asObject(body, 'body');
  const entryType = asString(obj.entry_type, 'entry_type') as LabEntryType;
  if (!LAB_ENTRY_TYPES.includes(entryType)) {
    throw new LabInputValidationError(`entry_type must be one of: ${LAB_ENTRY_TYPES.join(', ')}`);
  }
  const consentMode = (asOptionalString(obj.consent_mode) ?? 'diegetic_opt_in') as LabConsentMode;
  if (!CONSENT_MODES.includes(consentMode)) {
    throw new LabInputValidationError(`consent_mode must be one of: ${CONSENT_MODES.join(', ')}`);
  }

  return {
    entry_type: entryType,
    entry_id: asString(obj.entry_id, 'entry_id'),
    consent_mode: consentMode,
    wallet: parseWalletOptional(obj.wallet),
  };
}

export function parseTelemetrySummary(input: unknown): TelemetrySummaryV1 {
  const obj = asObject(input, 'telemetry_summary');
  const schemaVersion = Number(obj.schema_version);
  if (schemaVersion !== 1) {
    throw new LabInputValidationError('telemetry_summary.schema_version must be 1');
  }
  const scenarioType = asString(obj.scenario_type, 'telemetry_summary.scenario_type') as TelemetrySummaryV1['scenario_type'];
  if (!SCENARIO_TYPES.includes(scenarioType)) {
    throw new LabInputValidationError(`telemetry_summary.scenario_type must be one of: ${SCENARIO_TYPES.join(', ')}`);
  }
  const consentMode = asOptionalString(obj.consent_mode) as LabConsentMode | undefined;
  if (consentMode && !CONSENT_MODES.includes(consentMode)) {
    throw new LabInputValidationError(`telemetry_summary.consent_mode must be one of: ${CONSENT_MODES.join(', ')}`);
  }

  return {
    schema_version: 1,
    scenario_type: scenarioType,
    session_id: asString(obj.session_id, 'telemetry_summary.session_id'),
    story_id: asOptionalString(obj.story_id),
    case_id: asOptionalString(obj.case_id),
    event_id: asOptionalString(obj.event_id),
    reading_time_ms: asFiniteNumber(obj.reading_time_ms, 'telemetry_summary.reading_time_ms'),
    progress_ratio: asFiniteNumber(obj.progress_ratio, 'telemetry_summary.progress_ratio'),
    scroll_entropy: asFiniteNumber(obj.scroll_entropy, 'telemetry_summary.scroll_entropy'),
    focus_blur_count: asFiniteNumber(obj.focus_blur_count, 'telemetry_summary.focus_blur_count'),
    input_latency_ms: asFiniteNumber(obj.input_latency_ms, 'telemetry_summary.input_latency_ms'),
    retry_count: asFiniteNumber(obj.retry_count, 'telemetry_summary.retry_count'),
    queue_wait_ms: asFiniteNumber(obj.queue_wait_ms, 'telemetry_summary.queue_wait_ms'),
    countdown_to_click_ms: asFiniteNumber(obj.countdown_to_click_ms, 'telemetry_summary.countdown_to_click_ms'),
    quiz_correct: asOptionalBoolean(obj.quiz_correct, 'telemetry_summary.quiz_correct'),
    quiz_answer_id: asFiniteNumber(obj.quiz_answer_id, 'telemetry_summary.quiz_answer_id'),
    consent_mode: consentMode,
    client_ts: asFiniteNumber(obj.client_ts, 'telemetry_summary.client_ts'),
    telemetry_hash: asOptionalString(obj.telemetry_hash),
  };
}

export function parseLabTelemetryIngestBody(body: unknown): {
  session_id: string;
  telemetry_summary: TelemetrySummaryV1;
} {
  const obj = asObject(body, 'body');
  const telemetry = parseTelemetrySummary(obj.telemetry_summary);
  const sessionId = asString(obj.session_id, 'session_id');
  if (telemetry.session_id !== sessionId) {
    throw new LabInputValidationError('session_id must match telemetry_summary.session_id');
  }
  return { session_id: sessionId, telemetry_summary: telemetry };
}

export function parseLabChallengeSubmitBody(body: unknown): LabChallengeSubmitInput {
  const obj = asObject(body, 'body');
  const entryType = asString(obj.entry_type, 'entry_type') as LabEntryType;
  if (!LAB_ENTRY_TYPES.includes(entryType)) {
    throw new LabInputValidationError(`entry_type must be one of: ${LAB_ENTRY_TYPES.join(', ')}`);
  }
  const telemetry = obj.telemetry_summary ? parseTelemetrySummary(obj.telemetry_summary) : undefined;
  const answer = obj.answer && typeof obj.answer === 'object' && !Array.isArray(obj.answer)
    ? (obj.answer as Record<string, unknown>)
    : undefined;
  return {
    session_id: asString(obj.session_id, 'session_id'),
    entry_type: entryType,
    entry_id: asString(obj.entry_id, 'entry_id'),
    answer,
    telemetry_summary: telemetry,
  };
}
