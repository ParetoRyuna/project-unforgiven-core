import { notFound } from 'next/navigation';

import { LabShell } from '@/app/lab/components/LabShell';
import { StoryRunner } from '@/app/lab/components/StoryRunner';
import { getStoryBySlug } from '@/services/behavior-lab-engine/src/catalog';

export default async function LabStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = getStoryBySlug(slug);
  if (!story) notFound();

  return (
    <LabShell title="Narrative Gate" subtitle="Low-pressure human interaction sampling (Shadow Mode).">
      <StoryRunner story={story} />
    </LabShell>
  );
}
