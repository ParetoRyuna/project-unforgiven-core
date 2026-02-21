"use client";

import { motion } from "framer-motion";

import type { ChoicePresentation } from "../content/choices";

type Props = {
  choices: { id: number; label: string }[];
  presentation: ChoicePresentation[];
  disabled: boolean;
  onChoose: (choiceId: number) => void;
};

function tagLabel(item: ChoicePresentation | undefined): string {
  if (!item) return "";
  if (item.recommended) return "RECOMMENDED";
  if (item.dangerous) return "RISK";
  return item.tone.toUpperCase();
}

export function ChoiceBar({ choices, presentation, disabled, onChoose }: Props) {
  return (
    <div className="choice-bar">
      {choices.map((choice, idx) => {
        const view = presentation.find((it) => it.choiceId === choice.id);
        return (
          <motion.button
            key={choice.id}
            type="button"
            className={`choice-vn tone-${view?.tone ?? "neutral"}`}
            onClick={() => onChoose(choice.id)}
            disabled={disabled}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.07, duration: 0.22 }}
          >
            <div className="choice-main">{view?.cn ?? choice.label}</div>
            <div className="choice-sub">{view?.en ?? choice.label}</div>
            {view && <span className="choice-tag">{tagLabel(view)}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
