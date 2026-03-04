import type { RiskSignal } from '@/services/fan-pass-hub/src/types';

import type {
  ModelLayerBreakdown,
  PressureEventSource,
  ShadowScoringResult,
  TelemetrySummaryV1,
} from './types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushSignal(signals: RiskSignal[], reasonCodes: string[], signal: RiskSignal['signal'], weight: number, source: RiskSignal['source'], reason: string): void {
  signals.push({ signal, weight, source });
  reasonCodes.push(reason);
}

function finalizeShadowResult(input: {
  baseHumanScore: number;
  pressureBehaviorScore: number;
  graphRiskScore?: number;
  reasonCodes: string[];
  signals: RiskSignal[];
}): ShadowScoringResult {
  const graphRiskScore = input.graphRiskScore ?? 0;
  const humanConfidence = clamp(Math.round((input.baseHumanScore + input.pressureBehaviorScore) / 2 - graphRiskScore * 0.2), 0, 100);

  let localDecision: ShadowScoringResult['local_decision'] = 'allow';
  if (humanConfidence < 35) localDecision = 'block';
  else if (humanConfidence < 50) localDecision = 'step_up';

  const sampleEligible = localDecision === 'allow' && humanConfidence >= 80;

  return {
    local_decision: localDecision,
    human_confidence: humanConfidence,
    sample_eligible: sampleEligible,
    reason_codes: input.reasonCodes,
    risk_signals: input.signals,
    model_layer_breakdown: {
      base_human_score: clamp(Math.round(input.baseHumanScore), 0, 100),
      pressure_behavior_score: clamp(Math.round(input.pressureBehaviorScore), 0, 100),
      graph_risk_score: clamp(Math.round(graphRiskScore), 0, 100),
    },
  };
}

export function scoreNarrativeShadow(input: {
  telemetry: TelemetrySummaryV1 | null;
  quizCorrect: boolean;
}): ShadowScoringResult {
  const telemetry = input.telemetry;
  const signals: RiskSignal[] = [];
  const reasonCodes: string[] = ['scenario_narrative_shadow'];

  let base = 55;
  let pressure = 50;

  const reading = telemetry?.reading_time_ms ?? 0;
  if (reading >= 180_000) {
    base += 18;
    reasonCodes.push('narrative_dwell_strong');
  } else if (reading >= 90_000) {
    base += 10;
    reasonCodes.push('narrative_dwell_ok');
  } else if (reading > 0 && reading < 45_000) {
    base -= 28;
    pushSignal(signals, reasonCodes, 'narrative_low_dwell', 18, 'behavior', 'narrative_low_dwell');
  } else {
    base -= 8;
    reasonCodes.push('narrative_dwell_missing_or_short');
  }

  const progress = telemetry?.progress_ratio;
  if (typeof progress === 'number') {
    if (progress >= 0.85) {
      base += 10;
      reasonCodes.push('narrative_progress_high');
    } else if (progress < 0.5) {
      base -= 14;
      reasonCodes.push('narrative_progress_low');
    }
  }

  const entropy = telemetry?.scroll_entropy;
  if (typeof entropy === 'number') {
    if (entropy >= 0.3 && entropy <= 8) {
      base += 8;
      reasonCodes.push('narrative_scroll_natural');
    } else {
      base -= 12;
      pushSignal(signals, reasonCodes, 'narrative_scroll_anomaly', 12, 'behavior', 'narrative_scroll_anomaly');
    }
  }

  if (telemetry?.focus_blur_count && telemetry.focus_blur_count >= 6) {
    base -= 10;
    pushSignal(signals, reasonCodes, 'focus_instability', 10, 'behavior', 'focus_instability');
  }

  const latency = telemetry?.input_latency_ms ?? 0;
  if (latency >= 600 && latency <= 20_000) {
    base += 6;
    reasonCodes.push('narrative_answer_latency_natural');
  } else if (latency > 0 && latency < 180) {
    base -= 10;
    reasonCodes.push('narrative_answer_too_fast');
  }

  if (input.quizCorrect) {
    base += 20;
    pressure += 5;
    reasonCodes.push('narrative_quiz_correct');
  } else {
    base -= 35;
    pressure -= 10;
    pushSignal(signals, reasonCodes, 'narrative_quiz_fail', 24, 'behavior', 'narrative_quiz_fail');
  }

  return finalizeShadowResult({
    baseHumanScore: base,
    pressureBehaviorScore: pressure,
    reasonCodes,
    signals,
  });
}

export function scorePressureShadow(input: {
  event: PressureEventSource;
  telemetry: TelemetrySummaryV1 | null;
}): ShadowScoringResult {
  const telemetry = input.telemetry;
  const signals: RiskSignal[] = [];
  const reasonCodes: string[] = ['scenario_pressure_shadow'];

  let base = 48;
  let pressure = 55;

  const clickDelta = telemetry?.countdown_to_click_ms;
  if (typeof clickDelta === 'number') {
    if (clickDelta >= 0 && clickDelta <= input.event.click_window_good_ms) {
      pressure += 18;
      reasonCodes.push('pressure_click_window_good');
    } else if (clickDelta > input.event.click_window_good_ms * 4 || clickDelta < -100) {
      pressure -= 22;
      pushSignal(signals, reasonCodes, 'pressure_countdown_click_outlier', 18, 'behavior', 'pressure_countdown_click_outlier');
    } else {
      pressure -= 6;
      reasonCodes.push('pressure_click_window_off');
    }
  } else {
    pressure -= 12;
    reasonCodes.push('pressure_click_timing_missing');
  }

  const retryCount = telemetry?.retry_count ?? 0;
  if (retryCount <= 2) {
    pressure += 8;
    reasonCodes.push('pressure_retry_controlled');
  } else if (retryCount >= 5) {
    pressure -= 25;
    pushSignal(signals, reasonCodes, 'pressure_retry_burst', 22, 'behavior', 'pressure_retry_burst');
  } else {
    pressure -= 8;
    reasonCodes.push('pressure_retry_elevated');
  }

  const queueWait = telemetry?.queue_wait_ms;
  if (typeof queueWait === 'number') {
    if (queueWait >= 300 && queueWait <= 8_000) {
      pressure += 8;
      reasonCodes.push('pressure_queue_wait_plausible');
    } else if (queueWait < 50) {
      pressure -= 10;
      pushSignal(signals, reasonCodes, 'pressure_queue_rejoin_anomaly', 10, 'behavior', 'pressure_queue_rejoin_anomaly');
    }
  }

  if (telemetry?.focus_blur_count && telemetry.focus_blur_count >= 4) {
    base -= 12;
    pushSignal(signals, reasonCodes, 'focus_instability', 10, 'behavior', 'focus_instability');
  }

  const latency = telemetry?.input_latency_ms;
  if (typeof latency === 'number') {
    if (latency >= 80 && latency <= 4_000) {
      pressure += 5;
      reasonCodes.push('pressure_latency_plausible');
    } else {
      pressure -= 10;
      pushSignal(signals, reasonCodes, 'pressure_latency_pattern_anomaly', 12, 'behavior', 'pressure_latency_pattern_anomaly');
    }
  }

  return finalizeShadowResult({
    baseHumanScore: base,
    pressureBehaviorScore: pressure,
    reasonCodes,
    signals,
  });
}
