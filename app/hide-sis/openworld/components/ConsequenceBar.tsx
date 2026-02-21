"use client";

import { useMemo } from "react";
import type { ScenePayload } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  effects: ScenePayload["effects"] | null;
};

type EffectSummary = {
  dignity_delta: number;
  relation_delta: number;
  pollution_delta: number;
  truth_delta: number;
  heat_delta: number;
};

function sumEffects(effects: ScenePayload["effects"]): EffectSummary {
  return effects.reduce<EffectSummary>(
    (acc, effect) => ({
      dignity_delta: acc.dignity_delta + (effect.dignity_delta ?? 0),
      relation_delta: acc.relation_delta + (effect.relation_delta ?? 0),
      pollution_delta: acc.pollution_delta + (effect.pollution_delta ?? 0),
      truth_delta: acc.truth_delta + (effect.truth_delta ?? 0),
      heat_delta: acc.heat_delta + (effect.heat_delta ?? 0),
    }),
    {
      dignity_delta: 0,
      relation_delta: 0,
      pollution_delta: 0,
      truth_delta: 0,
      heat_delta: 0,
    },
  );
}

export function ConsequenceBar({ effects }: Props) {
  const summary = useMemo(() => {
    if (!effects || effects.length === 0) return null;
    const totals = sumEffects(effects);
    const hasChange = Object.values(totals).some((value) => value !== 0);
    return hasChange ? totals : null;
  }, [effects]);

  if (!summary) return null;

  const chips = [
    { key: "truth_delta", label: "真相 Truth", value: summary.truth_delta, intent: "positive" },
    { key: "relation_delta", label: "关系 Relation", value: summary.relation_delta, intent: "positive" },
    { key: "dignity_delta", label: "尊严 Dignity", value: summary.dignity_delta, intent: "positive" },
    { key: "pollution_delta", label: "污染 Pollution", value: summary.pollution_delta, intent: "inverse" },
    { key: "heat_delta", label: "热度 Heat", value: summary.heat_delta, intent: "inverse" },
  ]
    .filter((chip) => chip.value !== 0)
    .map((chip) => ({
      ...chip,
      sign: chip.value > 0 ? "+" : "",
      className:
        chip.intent === "inverse"
          ? chip.value > 0
            ? "warn"
            : "cool"
          : chip.value > 0
            ? "pos"
            : "neg",
    }));

  if (chips.length === 0) return null;

  return (
    <section className="ow-card ow-consequence">
      <h3>Immediate Consequence</h3>
      <div className="ow-consequence-list">
        {chips.map((chip) => (
          <span key={chip.key} className={`ow-consequence-chip ${chip.className}`}>
            {chip.label} {chip.sign}
            {chip.value}
          </span>
        ))}
      </div>
    </section>
  );
}
