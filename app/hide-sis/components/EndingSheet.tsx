"use client";

import { motion } from "framer-motion";

import { HIDE_SIS_FRONTEND_ID_MAP } from "../mappings";
import type { EndingBreakdown, GameSession } from "../types";

type Props = {
  session: GameSession;
  breakdown: EndingBreakdown | null | undefined;
  onNewSession: () => void;
};

const reasonName: Record<string, { cn: string; en: string }> = {
  DIGNITY_LOW: { cn: "尊严分不足", en: "Dignity below threshold" },
  RELATION_LOW: { cn: "关系值不足", en: "Relation below threshold" },
  POLLUTION_LOCKED: { cn: "污染锁定", en: "Pollution locked" },
  REVEAL_MISSED: { cn: "揭露门未通过", en: "Reveal gate missed" },
  FRAMED_AND_JAILED: { cn: "被栽赃入狱", en: "Framed and jailed" },
  OATH_BROKEN: { cn: "誓约破裂", en: "Oath broken" },
  SILK_BURIAL_TRUE: { cn: "丝绸埋真相", en: "Silk burial true ending" },
};

export function EndingSheet({ session, breakdown, onNewSession }: Props) {
  const endingCode = session.finalized_event?.ending_code ?? session.ending_code;
  const labels = HIDE_SIS_FRONTEND_ID_MAP.labels.endings as Record<number, string>;

  return (
    <motion.section className="ending-sheet" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}>
      <p className="ending-kicker">Ending Locked</p>
      <h3>{labels[endingCode ?? 0] ?? `Ending ${endingCode}`}</h3>
      <p className="ending-meta">
        Humanity {session.finalized_event?.humanity_score ?? "--"} · Final Dignity {session.finalized_event?.final_dignity ?? "--"}
      </p>

      {breakdown && (
        <div className="ending-breakdown">
          <div className="gate-row">
            <span>Truth Gate</span>
            <strong>
              D {breakdown.truth_gate.d_ok ? "OK" : "X"} · T {breakdown.truth_gate.t_ok ? "OK" : "X"} · P{" "}
              {breakdown.truth_gate.pollution_ok ? "OK" : "X"} · R {breakdown.truth_gate.reveal_ok ? "OK" : "X"}
            </strong>
          </div>
          <div className="gate-row">
            <span>Ending Gate</span>
            <strong>
              Decision {breakdown.ending_gate.decision_code} · Stable {breakdown.ending_gate.stable_path_ok ? "YES" : "NO"}
            </strong>
          </div>
          <ul className="reason-list">
            {breakdown.reason_codes.map((code) => (
              <li key={code}>
                <b>{reasonName[code]?.cn ?? code}</b>
                <span>{reasonName[code]?.en ?? code}</span>
              </li>
            ))}
          </ul>
          <p className="ending-hint">{breakdown.hint_cn}</p>
          <p className="ending-hint en">{breakdown.hint_en}</p>
        </div>
      )}

      <button type="button" className="new-session-btn" onClick={onNewSession}>
        新开一局 New Session
      </button>
    </motion.section>
  );
}
