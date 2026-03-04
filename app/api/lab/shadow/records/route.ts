import { NextRequest, NextResponse } from 'next/server';

import { listShadowRecords } from '@/services/behavior-lab-engine/src/session_store';
import type { LabEntryType } from '@/services/behavior-lab-engine/src/types';

const ENTRY_TYPES: LabEntryType[] = ['story', 'case', 'daily_log', 'pressure_event'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 50;
  const entryType = searchParams.get('entry_type') as LabEntryType | null;
  const scenarioType = searchParams.get('scenario_type');

  let records = listShadowRecords();
  if (entryType && ENTRY_TYPES.includes(entryType)) {
    records = records.filter((r) => r.entry_type === entryType);
  }
  if (scenarioType && ['narrative', 'pressure_sim', 'live_shadow'].includes(scenarioType)) {
    records = records.filter((r) => r.scenario_type === scenarioType);
  }

  const sorted = [...records].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  return NextResponse.json({
    schema_version: 1,
    count: sorted.length,
    total: records.length,
    records: sorted,
  });
}
