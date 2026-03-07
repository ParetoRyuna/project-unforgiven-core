import { LabEntryCard } from './components/LabEntryCard';
import { LabShell } from './components/LabShell';

import { listLabEntries } from '@/services/behavior-lab-engine/src/catalog';

export default function LabHomePage() {
  const entries = listLabEntries();
  const sections = [
    { key: 'story', title: 'Phase 01: Story Gate', subtitle: '低压热身 · 先建立世界观与阅读行为样本' },
    { key: 'case', title: 'Phase 02: Case Trial', subtitle: '中压推理 · 开始考察信息筛选与判断一致性' },
    { key: 'daily_log', title: 'Phase 03: Daily Pulse', subtitle: '日更采样 · 稳定回访与轻量校准入口' },
    { key: 'pressure_event', title: 'Phase 04: Pressure Gate', subtitle: '高压抢占 · 倒计时 + 重试 + 队列模拟' },
  ] as const;

  return (
    <LabShell title="WanWan Human Trial" subtitle="Suspense playground + behavior calibration engine.">
      <div className="font-sans">
        <section className="relative overflow-hidden rounded-2xl border border-zinc-700/70 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-5">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 h-44 w-44 rounded-full bg-sky-500/20 blur-3xl" />

          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/90">Protocol Brief</p>
          <h2 className="mt-2 text-4xl font-semibold leading-none tracking-wide text-zinc-100">
            HUMAN OR SCRIPT?
          </h2>
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-zinc-300">
            这不是看小说的站，而是一个可玩的悬疑挑战链。你每次阅读、推理和抢占，都会产出一条 Shadow Mode 评分记录。
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-zinc-700/80 bg-black/40 p-2">
              <p className="text-zinc-500">Session</p>
              <p className="text-zinc-100 font-semibold">4 关卡</p>
            </div>
            <div className="rounded-lg border border-zinc-700/80 bg-black/40 p-2">
              <p className="text-zinc-500">单次耗时</p>
              <p className="text-zinc-100 font-semibold">2-6 分钟</p>
            </div>
            <div className="rounded-lg border border-zinc-700/80 bg-black/40 p-2">
              <p className="text-zinc-500">拦截模式</p>
              <p className="text-zinc-100 font-semibold">Shadow Only</p>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-400">
          <p className="uppercase tracking-[0.14em] text-zinc-500">Recommended Route</p>
          <p>
            建议按顺序体验：<span className="text-zinc-200">Story</span> → <span className="text-zinc-200">Case</span> → <span className="text-zinc-200">Daily</span> → <span className="text-zinc-200">Pressure</span>。
            这样你会明显感受到从低压到高压的变化。
          </p>
        </section>

        <div className="mt-5 space-y-5">
          {sections.map((section) => {
            const group = entries.filter((entry) => entry.entry_type === section.key);
            return (
              <section key={section.key} className="space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-semibold tracking-wide text-zinc-100">{section.title}</h3>
                    <p className="text-xs text-zinc-500">{section.subtitle}</p>
                  </div>
                  <span className="text-[11px] text-zinc-500">{group.length} items</span>
                </div>
                <div className="space-y-2">
                  {group.map((entry) => (
                    <LabEntryCard key={`${entry.entry_type}:${entry.id}`} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </LabShell>
  );
}
