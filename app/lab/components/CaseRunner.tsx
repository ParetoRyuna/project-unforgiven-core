'use client';

import type { CaseSource } from '@/services/behavior-lab-engine/src/types';

import { NarrativeQuizRunner } from './NarrativeQuizRunner';

export function CaseRunner({ entry }: { entry: CaseSource }) {
  const paragraphs = [entry.prompt, ...(entry.clues ?? []).map((clue, i) => `线索 ${i + 1}: ${clue}`)];
  return (
    <NarrativeQuizRunner
      entryType="case"
      entryId={entry.id}
      title={entry.title}
      subtitle={entry.subtitle}
      consentHint={entry.consent_hint}
      paragraphs={paragraphs}
      quiz={entry.quiz}
      sessionStartLabel="进入案件判定（记录摘要）"
      contentLabel="案件材料"
    />
  );
}
