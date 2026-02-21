"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { DialogueBeat } from "../content/scenes";

type Props = {
  beat: DialogueBeat;
  canAdvance: boolean;
  onAdvance: () => void;
};

function speakerName(s: DialogueBeat["speaker"]) {
  if (s === "picha") return "Picha";
  if (s === "baibua") return "Baibua";
  return "Narration";
}

export function DialogueBox({ beat, canAdvance, onAdvance }: Props) {
  const reduced = useReducedMotion();
  const fullText = useMemo(() => `${beat.cn}\n${beat.en}`, [beat.cn, beat.en]);
  const [index, setIndex] = useState(reduced ? fullText.length : 0);

  useEffect(() => {
    setIndex(reduced ? fullText.length : 0);
  }, [fullText, reduced]);

  useEffect(() => {
    if (reduced || index >= fullText.length) return;
    const t = window.setTimeout(() => setIndex((i) => i + 2), 18);
    return () => window.clearTimeout(t);
  }, [index, fullText.length, reduced]);

  const current = reduced ? fullText : fullText.slice(0, index);
  const done = index >= fullText.length;

  return (
    <motion.div className="dialogue-box" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }}>
      <div className="dialogue-header">
        <span className="speaker-tag">{speakerName(beat.speaker)}</span>
        <span className="speaker-emotion">{beat.emotion}</span>
      </div>
      <div className="dialogue-cn-en">
        {current.split("\n").map((line, i) => (
          <p key={`${i}-${line}`} className={i === 0 ? "line-cn" : "line-en"}>
            {line}
          </p>
        ))}
      </div>
      <button type="button" className="advance-btn" onClick={onAdvance} disabled={!done || !canAdvance}>
        {done ? "继续 Continue" : "..."}
      </button>
    </motion.div>
  );
}
