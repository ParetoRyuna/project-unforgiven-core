import { createHash } from 'crypto';

import { handleShieldScoreRequest } from '../../shield-oracle/src/handler.ts';
import { getReputationSnapshot } from './graph_store.ts';
import type {
  HubActionType,
  HubDecisionQuoteRequest,
  HubDecisionQuoteResponse,
  RiskSignal,
  SignaturePayload,
} from './types.ts';

type ShieldSuccessBody = {
  payload?: {
    initial_price?: string;
    attestation_expiry?: string;
    nonce?: string;
    dignity_score?: number;
  };
  adapter_breakdown?: {
    totalScore?: number;
  };
  payload_hex?: string;
  oracle_signature_hex?: string;
  oracle_pubkey?: string;
  uniq_key?: string;
};

type QuoteCacheState = {
  byKey: Map<string, HubDecisionQuoteResponse>;
};

type ScenarioDecisionBias = 'none' | 'step_up' | 'block';

type ScenarioAssessment = {
  signals: RiskSignal[];
  reason_codes: string[];
  decision_bias: ScenarioDecisionBias;
};

const HUB_DECISION_CACHE_KEY = '__fanPassHubDecisionCacheV1';

function getCache(): QuoteCacheState {
  const globalRef = globalThis as typeof globalThis & {
    [HUB_DECISION_CACHE_KEY]?: QuoteCacheState;
  };
  if (!globalRef[HUB_DECISION_CACHE_KEY]) {
    globalRef[HUB_DECISION_CACHE_KEY] = { byKey: new Map<string, HubDecisionQuoteResponse>() };
  }
  return globalRef[HUB_DECISION_CACHE_KEY] as QuoteCacheState;
}

function stableCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableCopy(item));
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableCopy(obj[key]);
      return acc;
    }, {});
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function cacheKey(input: HubDecisionQuoteRequest, snapshotVersion: number): string {
  return sha256Hex(
    JSON.stringify({
      wallet: input.wallet,
      action_type: input.action_type,
      asset_id: input.asset_id,
      context: stableCopy(input.context ?? {}),
      proofs: stableCopy(input.proofs ?? []),
      risk_signals: stableCopy(input.risk_signals ?? []),
      snapshot_version: snapshotVersion,
    }),
  );
}

function actionNeedsStepUp(actionType: HubActionType): boolean {
  return ['resale', 'claim', 'membership_upgrade'].includes(actionType);
}

function applyRiskSignals(base: RiskSignal[], external: RiskSignal[] | undefined): RiskSignal[] {
  return [...base, ...(external ?? [])];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readTelemetrySummary(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata.telemetry_summary;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function assessScenarioTelemetry(metadata: Record<string, unknown> | undefined): ScenarioAssessment {
  const scenarioType = typeof metadata?.scenario_type === 'string' ? metadata.scenario_type : null;
  const telemetry = readTelemetrySummary(metadata);
  const result: ScenarioAssessment = {
    signals: [],
    reason_codes: [],
    decision_bias: 'none',
  };

  if (!scenarioType || !telemetry) return result;

  if (scenarioType === 'narrative') {
    const reading = toFiniteNumber(telemetry.reading_time_ms);
    const quizCorrect = typeof telemetry.quiz_correct === 'boolean' ? telemetry.quiz_correct : null;
    const scrollEntropy = toFiniteNumber(telemetry.scroll_entropy);
    const focusBlurCount = toFiniteNumber(telemetry.focus_blur_count);

    result.reason_codes.push('scenario_narrative');
    if (reading !== null && reading > 0 && reading < 45_000) {
      result.signals.push({ signal: 'narrative_low_dwell', weight: 18, source: 'behavior' });
      result.reason_codes.push('narrative_low_dwell');
      if (result.decision_bias !== 'block') result.decision_bias = 'step_up';
    }
    if (quizCorrect === false) {
      result.signals.push({ signal: 'narrative_quiz_fail', weight: 24, source: 'behavior' });
      result.reason_codes.push('narrative_quiz_fail');
      result.decision_bias = 'step_up';
      if (reading !== null && reading < 60_000) {
        result.decision_bias = 'block';
      }
    }
    if (scrollEntropy !== null && (scrollEntropy < 0.2 || scrollEntropy > 9)) {
      result.signals.push({ signal: 'narrative_scroll_anomaly', weight: 12, source: 'behavior' });
      result.reason_codes.push('narrative_scroll_anomaly');
    }
    if (focusBlurCount !== null && focusBlurCount >= 6) {
      result.signals.push({ signal: 'focus_instability', weight: 10, source: 'behavior' });
      result.reason_codes.push('focus_instability');
    }
  }

  if (scenarioType === 'pressure_sim') {
    const retryCount = toFiniteNumber(telemetry.retry_count);
    const clickDelta = toFiniteNumber(telemetry.countdown_to_click_ms);
    const queueWait = toFiniteNumber(telemetry.queue_wait_ms);
    const inputLatency = toFiniteNumber(telemetry.input_latency_ms);
    const focusBlurCount = toFiniteNumber(telemetry.focus_blur_count);

    result.reason_codes.push('scenario_pressure_sim');
    if (retryCount !== null && retryCount >= 5) {
      result.signals.push({ signal: 'pressure_retry_burst', weight: 22, source: 'behavior' });
      result.reason_codes.push('pressure_retry_burst');
      result.decision_bias = 'step_up';
    }
    if (clickDelta !== null && (clickDelta < -100 || clickDelta > 4_000)) {
      result.signals.push({ signal: 'pressure_countdown_click_outlier', weight: 18, source: 'behavior' });
      result.reason_codes.push('pressure_countdown_click_outlier');
      if (result.decision_bias !== 'block') result.decision_bias = 'step_up';
    }
    if (queueWait !== null && queueWait < 50) {
      result.signals.push({ signal: 'pressure_queue_rejoin_anomaly', weight: 10, source: 'behavior' });
      result.reason_codes.push('pressure_queue_rejoin_anomaly');
    }
    if (inputLatency !== null && (inputLatency < 80 || inputLatency > 10_000)) {
      result.signals.push({ signal: 'pressure_latency_pattern_anomaly', weight: 12, source: 'behavior' });
      result.reason_codes.push('pressure_latency_pattern_anomaly');
    }
    if (focusBlurCount !== null && focusBlurCount >= 4) {
      result.signals.push({ signal: 'focus_instability', weight: 10, source: 'behavior' });
      result.reason_codes.push('focus_instability');
    }
  }

  return result;
}

function extractShieldPayload(body: ShieldSuccessBody): SignaturePayload | null {
  if (!body.payload_hex || !body.oracle_signature_hex || !body.oracle_pubkey || !body.uniq_key || !body.payload?.nonce) {
    return null;
  }
  return {
    payload_hex: body.payload_hex,
    oracle_signature_hex: body.oracle_signature_hex,
    oracle_pubkey: body.oracle_pubkey,
    uniq_key: body.uniq_key,
    nonce: body.payload.nonce,
    attestation_expiry: body.payload.attestation_expiry ?? '0',
  };
}

function computePriceLamports(input: {
  basePrice: bigint;
  actionType: HubActionType;
  trustTier: 'low' | 'medium' | 'high';
}): bigint {
  let bps = 10_000;

  if (input.trustTier === 'high') bps -= 500;
  if (input.trustTier === 'low') bps += 1500;

  if (input.actionType === 'membership_upgrade') bps -= 300;
  if (input.actionType === 'resale') bps += 2500;
  if (input.actionType === 'claim') bps += 500;

  if (bps < 1) bps = 1;
  return (input.basePrice * BigInt(bps)) / 10_000n;
}

function determineMode(input: {
  actionType: HubActionType;
  hasProofs: boolean;
  reputationScore: number;
  trustTier: 'low' | 'medium' | 'high';
}): 'verified' | 'guest' | 'bot_suspected' {
  if (input.hasProofs) return 'verified';
  if (input.reputationScore < 20 && actionNeedsStepUp(input.actionType)) return 'bot_suspected';
  if (input.trustTier === 'low' && input.actionType === 'resale') return 'bot_suspected';
  return 'guest';
}

export async function quoteHubDecision(input: HubDecisionQuoteRequest): Promise<HubDecisionQuoteResponse> {
  const reputation = getReputationSnapshot(input.wallet, input.risk_signals);
  const cache = getCache();
  const key = cacheKey(input, reputation.snapshot_version);
  const cached = cache.byKey.get(key);
  if (cached) return cached;

  const scenarioAssessment = assessScenarioTelemetry(input.context?.metadata);
  const mergedRiskSignals = applyRiskSignals(
    applyRiskSignals(reputation.risk_signals, input.risk_signals),
    scenarioAssessment.signals,
  );
  const mode = determineMode({
    actionType: input.action_type,
    hasProofs: (input.proofs ?? []).length > 0,
    reputationScore: reputation.score,
    trustTier: reputation.trust_tier,
  });

  const basePrice = BigInt(input.context?.amount_lamports ?? '1000000000');
  const shieldResult = await handleShieldScoreRequest({
    wallet: input.wallet,
    reclaim_attestations: input.proofs,
    mode,
    initial_price: basePrice.toString(),
  });
  const reasonCodes: string[] = [];

  if (shieldResult.status !== 200) {
    reasonCodes.push(`shield_status_${shieldResult.status}`);
    reasonCodes.push(...scenarioAssessment.reason_codes);
    const hasProofs = (input.proofs ?? []).length > 0;
    if (hasProofs) reasonCodes.push('proof_verification_failed');
    const fallbackPrice = computePriceLamports({
      basePrice,
      actionType: input.action_type,
      trustTier: reputation.trust_tier,
    });
    const fallbackDecision: HubDecisionQuoteResponse['decision'] =
      shieldResult.status === 409 || (hasProofs && [400, 401, 403].includes(shieldResult.status)) ? 'block' : 'step_up';
    const biasedFallbackDecision: HubDecisionQuoteResponse['decision'] =
      scenarioAssessment.decision_bias === 'block'
        ? 'block'
        : scenarioAssessment.decision_bias === 'step_up'
          ? 'step_up'
          : fallbackDecision;
    const fallback: HubDecisionQuoteResponse = {
      decision: biasedFallbackDecision,
      tier: mode,
      final_price_lamports: fallbackPrice.toString(),
      signature_payload: null,
      ttl_seconds: 0,
      snapshot_version: reputation.snapshot_version,
      snapshot_hash_hex: reputation.snapshot_hash_hex,
      risk_signals: mergedRiskSignals,
      reason_codes: [...new Set(reasonCodes)],
    };
    cache.byKey.set(key, fallback);
    return fallback;
  }

  const successBody = shieldResult.body as ShieldSuccessBody;
  const shieldPayload = extractShieldPayload(successBody);
  const dignity =
    successBody.payload?.dignity_score ??
    successBody.adapter_breakdown?.totalScore ??
    0;
  if (dignity <= 20) reasonCodes.push('dignity_below_threshold');
  if (mode === 'bot_suspected') reasonCodes.push('bot_suspected_mode');
  if (actionNeedsStepUp(input.action_type) && mode !== 'verified') reasonCodes.push('sensitive_action_requires_step_up');
  reasonCodes.push(...scenarioAssessment.reason_codes);

  const shieldBasePrice = BigInt(successBody.payload?.initial_price ?? basePrice.toString());
  const finalPrice = computePriceLamports({
    basePrice: shieldBasePrice,
    actionType: input.action_type,
    trustTier: reputation.trust_tier,
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const expirySec = Number(successBody.payload?.attestation_expiry ?? nowSec);
  const ttlSeconds = Math.max(0, expirySec - nowSec);

  let decision: HubDecisionQuoteResponse['decision'] = 'allow';
  if (dignity <= 20 || mode === 'bot_suspected') {
    decision = 'block';
  } else if (actionNeedsStepUp(input.action_type) && mode !== 'verified') {
    decision = 'step_up';
  }
  if (scenarioAssessment.decision_bias === 'block') {
    decision = 'block';
  } else if (scenarioAssessment.decision_bias === 'step_up' && decision === 'allow') {
    decision = 'step_up';
  }

  const response: HubDecisionQuoteResponse = {
    decision,
    tier: mode,
    final_price_lamports: finalPrice.toString(),
    signature_payload: shieldPayload,
    ttl_seconds: ttlSeconds,
    snapshot_version: reputation.snapshot_version,
    snapshot_hash_hex: reputation.snapshot_hash_hex,
    risk_signals: mergedRiskSignals,
    reason_codes: [...new Set(reasonCodes)],
  };
  cache.byKey.set(key, response);
  return response;
}

export function resetHubDecisionCacheForTests(): void {
  getCache().byKey.clear();
}
