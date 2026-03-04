import { notFound } from 'next/navigation';

import { DailyLogRunner } from '@/app/lab/components/DailyLogRunner';
import { LabShell } from '@/app/lab/components/LabShell';
import { getDailyLogBySlug } from '@/services/behavior-lab-engine/src/catalog';

export default async function LabDailyLogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getDailyLogBySlug(slug);
  if (!entry) notFound();

  return (
    <LabShell title="Daily Anomaly Log" subtitle="Low-pressure recurring sample intake with Shadow Mode.">
      <DailyLogRunner entry={entry} />
    </LabShell>
  );
}
