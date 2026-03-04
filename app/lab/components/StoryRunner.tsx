'use client';

import type { StoryEpisodeCompiled } from '@/services/behavior-lab-engine/src/types';

import { NarrativeQuizRunner } from './NarrativeQuizRunner';

export function StoryRunner({ story }: { story: StoryEpisodeCompiled }) {
  return (
    <NarrativeQuizRunner
      entryType="story"
      entryId={story.id}
      title={story.title}
      subtitle={story.subtitle}
      consentHint={story.consent_hint}
      paragraphs={story.paragraphs}
      quiz={story.quiz}
      sessionStartLabel="进入终章模式（记录摘要）"
      contentLabel="故事正文"
    />
  );
}
