"use client";

import { useState } from "react";

import type { GameSession, QuotePayload } from "../types";

type Props = {
  session: GameSession;
  lastQuote: QuotePayload | null;
};

export function HudDrawer({ session, lastQuote }: Props) {
  const [open, setOpen] = useState(false);
  const chapterBudget = session.chapter_budget_bps[String(session.current_node.chapter)] ?? 0;
  const pollutionLevel = session.pollution_score ?? (session.pollution_flag ? 1 : 0);

  return (
    <aside className={`hud-drawer ${open ? "open" : ""}`}>
      <button type="button" className="hud-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "隐藏侦查板 Hide" : "展开侦查板 Inspect"}
      </button>
      {open && (
        <div className="hud-content">
          <div className="hud-grid">
            <div>
              <label>Dignity</label>
              <strong>{session.dignity_score}</strong>
            </div>
            <div>
              <label>Relation</label>
              <strong>{session.relation_score >= 0 ? `+${session.relation_score}` : session.relation_score}</strong>
            </div>
            <div>
              <label>Pollution</label>
              <strong>
                {session.pollution_flag ? "ON" : "OFF"} · Lv {pollutionLevel}
              </strong>
            </div>
            <div>
              <label>Reveal Gate</label>
              <strong>{session.c2_n3_passed ? "PASSED" : "PENDING"}</strong>
            </div>
            <div>
              <label>Truth</label>
              <strong>{session.truth_unlocked ? "UNLOCKED" : "LOCKED"}</strong>
            </div>
            <div>
              <label>Budget</label>
              <strong>{chapterBudget} bps</strong>
            </div>
          </div>
          {lastQuote && (
            <p className="hud-quote">
              Last quote: {lastQuote.suspicion_cost} · cost {lastQuote.budget_cost_bps} bps · {lastQuote.blocked ? "blocked" : "open"}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
