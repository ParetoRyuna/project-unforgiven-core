"use client";

import type { Guidance, ScoreBreakdown, SessionClock } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  guidance: Guidance | null;
  showHook?: boolean;
  theme?: string;
  clock?: SessionClock | null;
  scorePreview?: ScoreBreakdown | null;
  rulebook?: string[];
};

export function QuestCard({ guidance, showHook, theme, clock, scorePreview, rulebook }: Props) {
  if (!guidance) return null;
  return (
    <section className="ow-card ow-quest">
      <h3>Objective</h3>
      {clock && scorePreview && (
        <div className="ow-rule-top">
          <span>Phase {clock.phase}</span>
          <span>Time Left {clock.time_left}</span>
          <span>Projected Grade {scorePreview.grade}</span>
        </div>
      )}
      {showHook && (
        <div className="ow-hook">
          <span className="ow-hook-tag">紧急</span>
          <div>
            <p className="ow-hook-cn">警署封锁已启动，你只有三分钟。</p>
            <p className="ow-hook-en">Lockdown is active. You have three minutes.</p>
          </div>
        </div>
      )}
      {rulebook && rulebook.length > 0 && (
        <div className="ow-rulebook">
          {rulebook.slice(0, 3).map((line, idx) => (
            <p key={`${idx}-${line}`}>{line}</p>
          ))}
        </div>
      )}
      <p className="ow-quest-cn">{guidance.objective_cn}</p>
      <p className="ow-quest-en">{guidance.objective_en}</p>
      <div className="ow-quest-next">
        <span>Next</span>
        <strong>{guidance.next_cn}</strong>
        <em>{guidance.next_en}</em>
      </div>
      {(guidance.reason_cn || theme) && (
        <p className="ow-quest-reason">
          {guidance.reason_cn ?? ""}
          {guidance.reason_cn && theme ? " · " : ""}
          {theme ? `主题：${theme}` : ""}
        </p>
      )}
      {guidance.reason_en && <p className="ow-quest-reason ow-quest-reason-en">{guidance.reason_en}</p>}
    </section>
  );
}
