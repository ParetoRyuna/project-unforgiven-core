import Link from 'next/link';

import type { LabManifestEntry } from '@/services/behavior-lab-engine/src/types';

const difficultyColor: Record<LabManifestEntry['difficulty'], string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const typeMeta: Record<LabManifestEntry['entry_type'], { label: string; hook: string; eta: string; action: string }> = {
  story: {
    label: 'Narrative Gate',
    hook: '阅读沉浸 + 剧情理解题，快速进入状态。',
    eta: '约 3 分钟',
    action: '进入故事任务',
  },
  case: {
    label: 'Case Trial',
    hook: '给你线索，判断哪条是伪造路径。',
    eta: '约 4 分钟',
    action: '开始案件推理',
  },
  daily_log: {
    label: 'Daily Pulse',
    hook: '一条异常日志 + 一道确认题，轻量回访。',
    eta: '约 2 分钟',
    action: '打开今日日志',
  },
  pressure_event: {
    label: 'Pressure Gate',
    hook: '倒计时抢占 + 队列等待，模拟真实高压场景。',
    eta: '约 2-5 分钟',
    action: '进入抢占模拟',
  },
};

export function LabEntryCard({ entry }: { entry: LabManifestEntry }) {
  const isAvailable = entry.status === 'ready' || entry.status === 'published';
  const meta = typeMeta[entry.entry_type];
  return (
    <article className="group rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.28)] transition hover:border-zinc-600">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{meta.label}</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-100 leading-tight">{entry.title}</h3>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${difficultyColor[entry.difficulty]}`}>
          {entry.difficulty}
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{entry.summary}</p>
      <p className="mt-1 text-xs text-zinc-500">{meta.hook}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">{meta.eta}</span>
        {isAvailable ? (
          <Link
            href={entry.path}
            className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-200"
          >
            {meta.action}
          </Link>
        ) : (
          <span className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500">即将开放</span>
        )}
      </div>
    </article>
  );
}
