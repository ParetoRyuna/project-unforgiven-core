'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { PressureEventSource, TelemetrySummaryV1 } from '@/services/behavior-lab-engine/src/types';

type StartSessionResponse = {
  session: { session_id: string };
};

type ChallengeResponse = {
  unlock_result: { status: 'success' | 'failure'; message: string };
  shadow_decision: 'allow' | 'step_up' | 'block';
  human_confidence: number;
  reason_codes: string[];
  would_step_up: boolean;
  would_block: boolean;
  sample_eligible: boolean;
};

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data?.error as string | undefined) ?? 'request failed');
  return data as T;
}

function getPhase(input: {
  sessionId: string | null;
  countdownRemaining: number;
  queueState: 'idle' | 'waiting' | 'done';
  result: ChallengeResponse | null;
}): string {
  if (!input.sessionId) return 'Briefing';
  if (input.result) return 'Report';
  if (input.queueState === 'waiting') return 'Queue';
  if (input.countdownRemaining > 0) return 'Countdown';
  return 'Window Open';
}

export function PressureRunner({ event }: { event: PressureEventSource }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('阅读规则后开始挑战。');
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<ChallengeResponse | null>(null);
  const [queueState, setQueueState] = useState<'idle' | 'waiting' | 'done'>('idle');
  const [queueWaitMs, setQueueWaitMs] = useState<number>(0);
  const [tick, setTick] = useState(0);

  const unlockAtRef = useRef<number | null>(null);
  const focusBlurCountRef = useRef(0);
  const finalClickDeltaRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 50);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onBlur() {
      focusBlurCountRef.current += 1;
    }
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  const now = Date.now() + tick * 0;
  const countdownRemaining = unlockAtRef.current ? Math.max(0, unlockAtRef.current - now) : event.countdown_ms;
  const phase = getPhase({ sessionId, countdownRemaining, queueState, result });

  async function startSession() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<StartSessionResponse>('/api/lab/session/start', {
        entry_type: 'pressure_event',
        entry_id: event.id,
        consent_mode: 'diegetic_opt_in',
      });
      const sid = String(res.session.session_id);
      setSessionId(sid);
      sessionStartedAtRef.current = Date.now();
      unlockAtRef.current = Date.now() + event.countdown_ms;
      finalClickDeltaRef.current = null;
      focusBlurCountRef.current = 0;
      setRetryCount(0);
      setQueueState('idle');
      setQueueWaitMs(0);
      setResult(null);
      setStatusText('倒计时启动。目标是在开窗后尽快点击，不要狂点。');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to start session');
    } finally {
      setBusy(false);
    }
  }

  function buildTelemetry(): TelemetrySummaryV1 {
    const clickDelta = finalClickDeltaRef.current ?? (unlockAtRef.current ? Date.now() - unlockAtRef.current : undefined);
    const inputLatency = sessionStartedAtRef.current ? Math.max(0, Date.now() - sessionStartedAtRef.current) : undefined;
    return {
      schema_version: 1,
      scenario_type: 'pressure_sim',
      session_id: sessionId ?? 'pending',
      event_id: event.id,
      retry_count: retryCount,
      queue_wait_ms: queueWaitMs,
      countdown_to_click_ms: typeof clickDelta === 'number' ? clickDelta : undefined,
      focus_blur_count: focusBlurCountRef.current,
      input_latency_ms: inputLatency,
      consent_mode: 'diegetic_opt_in',
      client_ts: Date.now(),
    };
  }

  async function handleAttempt() {
    if (!sessionId || !unlockAtRef.current) {
      setError('请先启动挑战。');
      return;
    }
    if (busy) return;

    const delta = Date.now() - unlockAtRef.current;
    if (delta < 0) {
      setRetryCount((v) => v + 1);
      setStatusText(`提前点击已记为重试 (${Math.abs(delta)}ms before window)`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      finalClickDeltaRef.current = delta;
      setQueueState('waiting');
      const simulatedQueue = Math.max(200, Math.min(9000, Math.round(260 + Math.random() * event.queue_window_ms)));
      setQueueWaitMs(simulatedQueue);
      setStatusText(`正在排队验证（${simulatedQueue}ms）...`);
      await new Promise((resolve) => setTimeout(resolve, simulatedQueue));

      const telemetry = buildTelemetry();
      await postJson('/api/lab/telemetry/ingest', {
        session_id: sessionId,
        telemetry_summary: telemetry,
      });
      const response = await postJson<ChallengeResponse>('/api/lab/challenge/submit', {
        session_id: sessionId,
        entry_type: 'pressure_event',
        entry_id: event.id,
        answer: { action: 'claim_slot' },
        telemetry_summary: telemetry,
      });
      setQueueState('done');
      setResult(response);
      setStatusText('结算完成：这是 Shadow Mode 结果，不会拦截你的流程。');
      try {
        window.localStorage.setItem(`wanwan:lab:completed:pressure_event:${event.id}`, '1');
      } catch {
        // ignore storage errors
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit attempt');
      setQueueState('idle');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-100">{event.title}</h2>
        {event.subtitle ? <p className="text-sm text-zinc-400">{event.subtitle}</p> : null}
        <p className="text-sm text-zinc-300 leading-relaxed">{event.description}</p>
        <p className="text-sm text-amber-200/90">{event.consent_hint}</p>

        <div className="rounded-lg border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300 space-y-1">
          <p className="uppercase tracking-[0.14em] text-zinc-500">规则</p>
          <p>1) 等待倒计时结束后点击 `Claim Slot`。</p>
          <p>2) 最佳点击窗口: 0 ~ {event.click_window_good_ms}ms。</p>
          <p>3) 重试次数建议 ≤ 4，过多会触发异常信号。</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">Phase</p>
            <p className="font-semibold text-zinc-100">{phase}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">Retry</p>
            <p className="font-semibold text-zinc-100 tabular-nums">{retryCount}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">Queue Wait</p>
            <p className="font-semibold text-zinc-100 tabular-nums">{queueWaitMs}ms</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">slot_limit</p>
            <p className="font-semibold text-zinc-100 tabular-nums">{event.slot_limit}</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-black/55 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Countdown</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-zinc-100">{(countdownRemaining / 1000).toFixed(2)}s</p>
          <p className="mt-1 text-xs text-zinc-500">{statusText}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={startSession}
            disabled={busy}
            className="rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            启动压力挑战
          </button>
          <button
            type="button"
            onClick={handleAttempt}
            disabled={busy || !sessionId}
            className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          >
            {queueState === 'waiting' ? '排队中...' : 'Claim Slot'}
          </button>
        </div>
      </section>

      {result ? (
        <section className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-zinc-100">结算报告</h3>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${result.shadow_decision === 'allow' ? 'bg-emerald-500/15 text-emerald-300' : result.shadow_decision === 'step_up' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
              shadow: {result.shadow_decision}
            </span>
          </div>
          <p className="text-sm text-zinc-200">{result.unlock_result.message}</p>
          <p className="text-sm text-zinc-400">Human confidence: {result.human_confidence}</p>
          <p className="text-xs text-zinc-500">sample_eligible: {String(result.sample_eligible)} · would_block: {String(result.would_block)} · would_step_up: {String(result.would_step_up)}</p>
          <p className="text-xs text-zinc-500 break-words">reasons: {result.reason_codes.join(', ')}</p>
          <div className="flex gap-2 pt-2">
            <Link href="/lab" className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-200">
              返回总入口
            </Link>
            <Link href="/api/lab/shadow/records?limit=20" className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">
              查看 Shadow 记录
            </Link>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
