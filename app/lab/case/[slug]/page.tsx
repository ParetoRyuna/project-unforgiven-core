import { notFound } from 'next/navigation';

import { CaseRunner } from '@/app/lab/components/CaseRunner';
import { LabShell } from '@/app/lab/components/LabShell';
import { getCaseBySlug } from '@/services/behavior-lab-engine/src/catalog';

export default async function LabCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getCaseBySlug(slug);
  if (!entry) notFound();

  return (
    <LabShell title="Interactive Case" subtitle="Medium-pressure reasoning flow with Shadow Mode scoring.">
      <CaseRunner entry={entry} />
    </LabShell>
  );
}
