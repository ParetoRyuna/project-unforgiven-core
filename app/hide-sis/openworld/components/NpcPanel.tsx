"use client";

import type { Action, ActionPreview, NPC } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  npcs: NPC[];
  relationMap: Record<string, number>;
  onInterrogate: (npcId: string) => void;
  onLie: (npcId: string) => void;
  onAlly: (npcId: string) => void;
  disabled?: boolean;
  suggestedAction?: Action | null;
  previews?: ActionPreview[];
};

function previewText(previews: ActionPreview[] | undefined, id: string): string {
  if (!previews) return "";
  const found = previews.find((entry) => entry.action_id === id);
  if (!found) return "";
  const bits: string[] = [`T-${found.time_cost}`];
  if (typeof found.expected.truth === "number") bits.push(`真相${found.expected.truth >= 0 ? "+" : ""}${found.expected.truth}`);
  if (typeof found.expected.relation === "number") bits.push(`关系${found.expected.relation >= 0 ? "+" : ""}${found.expected.relation}`);
  if (typeof found.expected.humanity === "number") bits.push(`人性${found.expected.humanity >= 0 ? "+" : ""}${found.expected.humanity}`);
  return bits.join(" ");
}

export function NpcPanel({ npcs, relationMap, onInterrogate, onLie, onAlly, disabled, suggestedAction, previews }: Props) {
  return (
    <section className="ow-card">
      <h3>NPCs</h3>
      <div className="ow-npc-list">
        {npcs.map((npc) => {
          const relation = relationMap[npc.id] ?? 0;
          const level = Math.max(0, Math.min(3, relation));
          const isCold = relation < 0;
          const interrogateMeta = previewText(previews, `INTERROGATE:${npc.id}`);
          const lieMeta = previewText(previews, `LIE:${npc.id}`);
          const allyMeta = previewText(previews, `ALLY:${npc.id}`);
          return (
            <div key={npc.id} className="ow-npc-card">
              <div className="ow-npc-head">
                <div className={`ow-npc-avatar ${isCold ? "cold" : ""}`} aria-hidden="true">
                  {npc.name.slice(0, 1)}
                </div>
                <div>
                  <div className="ow-npc-name">{npc.name}</div>
                  <div className="ow-npc-role">{npc.role}</div>
                </div>
              </div>
              <div className={`ow-npc-relation ${isCold ? "cold" : "warm"}`}>
                <span>Relation {relation}</span>
                <div className="ow-npc-bars" aria-hidden="true">
                  {[0, 1, 2].map((idx) => (
                    <span key={`${npc.id}-${idx}`} className={idx < level ? "active" : ""} />
                  ))}
                </div>
              </div>
              <div className="ow-npc-actions">
                <button
                  type="button"
                  onClick={() => onInterrogate(npc.id)}
                  disabled={disabled}
                  className={suggestedAction?.type === "INTERROGATE" && suggestedAction.target_id === npc.id ? "suggested" : ""}
                >
                  <span>审问</span>
                  {interrogateMeta && <small className="ow-btn-meta">{interrogateMeta}</small>}
                </button>
                <button
                  type="button"
                  onClick={() => onLie(npc.id)}
                  disabled={disabled}
                  className={suggestedAction?.type === "LIE" && suggestedAction.target_id === npc.id ? "suggested" : ""}
                >
                  <span>撒谎</span>
                  {lieMeta && <small className="ow-btn-meta">{lieMeta}</small>}
                </button>
                <button
                  type="button"
                  onClick={() => onAlly(npc.id)}
                  disabled={disabled}
                  className={suggestedAction?.type === "ALLY" && suggestedAction.target_id === npc.id ? "suggested" : ""}
                >
                  <span>结盟</span>
                  {allyMeta && <small className="ow-btn-meta">{allyMeta}</small>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
