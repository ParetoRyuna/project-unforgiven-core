"use client";

import { useMemo, useState } from "react";
import type { Action, ActionPreview, Clue, NPC } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  clues: Clue[];
  npcs: NPC[];
  onUseClue: (clueId: string, npcId: string) => void;
  disabled?: boolean;
  suggestedAction?: Action | null;
  previews?: ActionPreview[];
};

function previewText(previews: ActionPreview[] | undefined, npcId: string, clueId: string): string {
  if (!previews) return "";
  const found = previews.find((entry) => entry.action_id === `USE_CLUE:${npcId}:${clueId}`);
  if (!found) return "";
  const bits: string[] = [`T-${found.time_cost}`];
  if (typeof found.expected.truth === "number") bits.push(`真相${found.expected.truth >= 0 ? "+" : ""}${found.expected.truth}`);
  if (typeof found.expected.purity === "number") bits.push(`纯净${found.expected.purity >= 0 ? "+" : ""}${found.expected.purity}`);
  return bits.join(" ");
}

export function Inventory({ clues, npcs, onUseClue, disabled, suggestedAction, previews }: Props) {
  const defaultNpc = npcs[0]?.id ?? "";
  const [targets, setTargets] = useState<Record<string, string>>({});

  const npcOptions = useMemo(() => npcs.map((npc) => ({ id: npc.id, label: npc.name })), [npcs]);

  return (
    <section className="ow-card">
      <h3>Evidence Board</h3>
      {clues.length === 0 && <p className="ow-empty">暂无线索 No clues yet.</p>}
      <div className="ow-clue-list">
        {clues.map((clue) => {
          const target = targets[clue.id] ?? defaultNpc;
          const isSuggested = suggestedAction?.type === "USE_CLUE" && suggestedAction.clue_id === clue.id;
          const suggestTarget = suggestedAction?.type === "USE_CLUE" ? suggestedAction.target_id : null;
          const useMeta = previewText(previews, target, clue.id);
          return (
            <div key={clue.id} className={`ow-clue ${isSuggested ? "suggested" : ""}`}>
              <div className="ow-clue-head">
                <div>
                  <div className="ow-clue-name">{clue.label}</div>
                  <div className="ow-clue-meta">Truth {clue.truth_value} · Risk {clue.pollution_risk}</div>
                </div>
                {isSuggested && <span className="ow-clue-tag">Recommended</span>}
              </div>
              <div className="ow-clue-actions">
                <select
                  value={target}
                  onChange={(event) =>
                    setTargets((prev) => ({
                      ...prev,
                      [clue.id]: event.target.value,
                    }))
                  }
                >
                  {npcOptions.map((npc) => (
                    <option key={npc.id} value={npc.id}>
                      {npc.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled || !target}
                  className={isSuggested || (suggestTarget && suggestTarget === target) ? "suggested" : ""}
                  onClick={() => onUseClue(clue.id, target)}
                >
                  <span>使用线索</span>
                  {useMeta && <small className="ow-btn-meta">{useMeta}</small>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
