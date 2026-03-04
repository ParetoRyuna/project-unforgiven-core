'use client';

import type { DailyLogSource } from '@/services/behavior-lab-engine/src/types';

import { NarrativeQuizRunner } from './NarrativeQuizRunner';

export function DailyLogRunner({ entry }: { entry: DailyLogSource }) {
  if (!entry.quiz) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/85 p-4 text-sm text-zinc-300">
        This daily log has no quiz configured yet.
      </div>
    );
  }

  return (
    <NarrativeQuizRunner
      entryType="daily_log"
      entryId={entry.id}
      title={entry.title}
      subtitle={entry.subtitle}
      consentHint={entry.consent_hint}
      paragraphs={entry.paragraphs ?? []}
      quiz={entry.quiz}
      sessionStartLabel="开始日志校准（记录摘要）"
      contentLabel="日志内容"
    />
  );
}
