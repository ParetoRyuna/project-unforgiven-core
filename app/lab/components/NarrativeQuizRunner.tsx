'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { NarrativeQuiz, TelemetrySummaryV1 } from '@/services/behavior-lab-engine/src/types';

type StartSessionResponse = {
  session: { session_id: string; shadow_mode_enabled: true } & Record<string, unknown>;
};

type ChallengeResponse = {
  unlock_result: { status: 'success' | 'failure'; message: string; correct?: boolean };
  shadow_decision: 'allow' | 'step_up' | 'block';
  human_confidence: number;
  reason_codes: string[];
  would_step_up: boolean;
  would_block: boolean;
  sample_eligible: boolean;
};

type NarrativeEntryType = 'story' | 'case' | 'daily_log';

type Props = {
  entryType: NarrativeEntryType;
  entryId: string;
  title: string;
  subtitle?: string;
  consentHint?: string;
  paragraphs: string[];
  quiz: NarrativeQuiz;
  sessionStartLabel?: string;
  contentLabel?: string;
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

function computeEntropy(samples: number[]): number {
  if (samples.length < 2) return 0;
  const bins = [0, 0, 0, 0, 0];
  for (const value of samples) {
    const abs = Math.abs(value);
    const idx = abs < 0.01 ? 0 : abs < 0.03 ? 1 : abs < 0.08 ? 2 : abs < 0.15 ? 3 : 4;
    bins[idx] += 1;
  }
  const total = samples.length;
  let entropy = 0;
  for (const count of bins) {
    if (!count) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(3));
}

function nextRoute(entryType: NarrativeEntryType): string {
  if (entryType === 'story') return '/lab/case/case-midnight-signal';
  if (entryType === 'case') return '/lab/daily/2026-02-26-first-anomaly';
  return '/lab/pressure/evt-20260301-final-gate';
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function NarrativeQuizRunner({
  entryType,
  entryId,
  title,
  subtitle,
  consentHint,
  paragraphs,
  quiz,
  sessionStartLabel,
  contentLabel = '内容',
}: Props) {
  const [mode, setMode] = useState<'diegetic_opt_in' | 'summary_only'>('diegetic_opt_in');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChallengeResponse | null>(null);
  const [statusText, setStatusText] = useState<string>('先阅读任务简报，然后点击开始。');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [readProgress, setReadProgress] = useState(0);

  const startAtRef = useRef<number | null>(null);
  const firstQuizInteractionAtRef = useRef<number | null>(null);
  const focusBlurCountRef = useRef(0);
  const maxProgressRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const scrollDeltaSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    function onBlur() {
      focusBlurCountRef.current += 1;
    }
    function onScroll() {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = Math.max(0, Math.min(1, window.scrollY / scrollable));
      maxProgressRef.current = Math.max(maxProgressRef.current, ratio);
      setReadProgress(maxProgressRef.current);
      const delta = window.scrollY - lastScrollYRef.current;
      lastScrollYRef.current = window.scrollY;
      const normalized = delta / Math.max(1, window.innerHeight);
      const arr = scrollDeltaSamplesRef.current;
      arr.push(normalized);
      if (arr.length > 120) arr.shift();
    }

    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !startAtRef.current) return;
    const id = window.setInterval(() => {
      if (!startAtRef.current) return;
      setElapsedMs(Date.now() - startAtRef.current);
    }, 400);
    return () => window.clearInterval(id);
  }, [sessionId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<StartSessionResponse>('/api/lab/session/start', {
        entry_type: entryType,
        entry_id: entryId,
        consent_mode: mode,
      });
      setSessionId(String(res.session.session_id));
      setResult(null);
      setSelectedOptionId(null);
      startAtRef.current = Date.now();
      firstQuizInteractionAtRef.current = null;
      focusBlurCountRef.current = 0;
      maxProgressRef.current = 0;
      scrollDeltaSamplesRef.current = [];
      lastScrollYRef.current = window.scrollY;
      setElapsedMs(0);
      setReadProgress(0);
      setStatusText(mode === 'summary_only' ? '已进入低痕浏览模式，提交会得到降级评分。' : '挑战已开始，完成阅读后回答问题。');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to start session');
    } finally {
      setBusy(false);
    }
  }

  function buildTelemetry(): TelemetrySummaryV1 {
    const now = Date.now();
    const reading = startAtRef.current ? Math.max(0, now - startAtRef.current) : 0;
    const inputLatency = firstQuizInteractionAtRef.current ? Math.max(0, now - firstQuizInteractionAtRef.current) : undefined;
    const telemetry: TelemetrySummaryV1 = {
      schema_version: 1,
      scenario_type: 'narrative',
      session_id: sessionId ?? 'pending',
      reading_time_ms: reading,
      progress_ratio: maxProgressRef.current,
      scroll_entropy: computeEntropy(scrollDeltaSamplesRef.current),
      focus_blur_count: focusBlurCountRef.current,
      input_latency_ms: inputLatency,
      quiz_answer_id: selectedOptionId ?? undefined,
      consent_mode: mode,
      client_ts: now,
    };
    if (entryType === 'story') telemetry.story_id = entryId;
    if (entryType === 'case') telemetry.case_id = entryId;
    return telemetry;
  }

  async function submitAnswer() {
    if (!sessionId) {
      setError('请先开始挑战。');
      return;
    }
    if (!selectedOptionId) {
      setError('请先选择一个答案。');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const telemetry = buildTelemetry();
      await postJson('/api/lab/telemetry/ingest', {
        session_id: sessionId,
        telemetry_summary: telemetry,
      });
      const response = await postJson<ChallengeResponse>('/api/lab/challenge/submit', {
        session_id: sessionId,
        entry_type: entryType,
        entry_id: entryId,
        answer: { option_id: selectedOptionId },
        telemetry_summary: telemetry,
      });
      setResult(response);
      setStatusText('提交完成，Shadow Mode 评分已记录。');
      try {
        window.localStorage.setItem(`wanwan:lab:completed:${entryType}:${entryId}`, '1');
      } catch {
        // ignore storage errors
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
        <div className="rounded-lg border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-300">
          <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Mission</p>
          <p className="mt-1">1) 阅读材料 2) 回答关键题 3) 解锁结果并记录 Shadow Score。</p>
          {consentHint ? <p className="mt-2 text-amber-200/90">{consentHint}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {sessionStartLabel ?? '开始挑战'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode((prev) => (prev === 'diegetic_opt_in' ? 'summary_only' : 'diegetic_opt_in'))}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50"
          >
            模式: {mode === 'diegetic_opt_in' ? '追踪摘要' : '低痕浏览'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">阅读时长</p>
            <p className="text-zinc-100 font-medium tabular-nums">{formatDuration(elapsedMs)}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black/30 p-2">
            <p className="text-zinc-500">阅读进度</p>
            <p className="text-zinc-100 font-medium tabular-nums">{Math.round(readProgress * 100)}%</p>
          </div>
        </div>

        <p className="text-xs text-zinc-500">{statusText}</p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-black/40 p-4 space-y-4">
        <h3 className="text-sm uppercase tracking-[0.14em] text-zinc-500">{contentLabel}</h3>
        <div className="space-y-3 text-[15px] leading-7 text-zinc-200">
          {paragraphs.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/85 p-4 space-y-3">
        <h3 className="text-sm uppercase tracking-[0.14em] text-zinc-400">关键题</h3>
        <p className="text-sm text-zinc-100">{quiz.question}</p>
        <div className="space-y-2">
          {quiz.options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 rounded-md border border-zinc-800 p-2 text-sm hover:border-zinc-600">
              <input
                type="radio"
                name={`quiz-${entryType}-${entryId}`}
                value={option.id}
                checked={selectedOptionId === option.id}
                onChange={() => {
                  if (!firstQuizInteractionAtRef.current) firstQuizInteractionAtRef.current = Date.now();
                  setSelectedOptionId(option.id);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || !sessionId}
          onClick={submitAnswer}
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? '提交中...' : '提交并解锁结果'}
        </button>
        {!sessionId ? <p className="text-xs text-zinc-500">请先开始挑战。</p> : null}
      </section>

      {result ? (
        <section className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-zinc-100">结算</h3>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${result.shadow_decision === 'allow' ? 'bg-emerald-500/15 text-emerald-300' : result.shadow_decision === 'step_up' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
              shadow: {result.shadow_decision}
            </span>
          </div>
          <p className="text-sm text-zinc-200">{result.unlock_result.message}</p>
          <p className="text-sm text-zinc-400">Human confidence: {result.human_confidence} / 100</p>
          <p className="text-xs text-zinc-500">sample_eligible: {String(result.sample_eligible)} · would_block: {String(result.would_block)} · would_step_up: {String(result.would_step_up)}</p>
          <p className="text-xs text-zinc-500 break-words">reasons: {result.reason_codes.join(', ')}</p>
          <div className="flex gap-2 pt-2">
            <Link href={nextRoute(entryType)} className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-200">
              进入下一关
            </Link>
            <Link href="/lab" className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">
              返回总入口
            </Link>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
