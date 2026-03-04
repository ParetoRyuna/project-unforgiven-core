import { notFound } from 'next/navigation';

import { LabShell } from '@/app/lab/components/LabShell';
import { PressureRunner } from '@/app/lab/components/PressureRunner';
import { getPressureEventBySlug } from '@/services/behavior-lab-engine/src/catalog';

export default async function LabPressurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getPressureEventBySlug(slug);
  if (!event) notFound();

  return (
    <LabShell title="Pressure Simulation" subtitle="Countdown + retries + queue wait (Shadow Mode, no blocking).">
      <PressureRunner event={event} />
    </LabShell>
  );
}
