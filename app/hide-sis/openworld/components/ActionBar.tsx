"use client";

import type { Action, ActionPreview } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  onSearch: () => void;
  onRest: () => void;
  onFinalize: () => void;
  disabled?: boolean;
  finalizeDisabled?: boolean;
  suggestedAction?: Action | null;
  previews?: ActionPreview[];
};

function findPreview(previews: ActionPreview[] | undefined, pattern: string): ActionPreview | null {
  if (!previews || previews.length === 0) return null;
  return previews.find((item) => item.action_id === pattern || item.action_id.startsWith(pattern)) ?? null;
}

function previewLine(preview: ActionPreview | null): string {
  if (!preview) return "";
  const pieces: string[] = [`T-${preview.time_cost}`];
  if (typeof preview.expected.truth === "number") pieces.push(`真相${preview.expected.truth >= 0 ? "+" : ""}${preview.expected.truth}`);
  if (typeof preview.expected.purity === "number") pieces.push(`纯净${preview.expected.purity >= 0 ? "+" : ""}${preview.expected.purity}`);
  if (typeof preview.expected.relation === "number") pieces.push(`关系${preview.expected.relation >= 0 ? "+" : ""}${preview.expected.relation}`);
  if (typeof preview.expected.humanity === "number") pieces.push(`人性${preview.expected.humanity >= 0 ? "+" : ""}${preview.expected.humanity}`);
  return pieces.join(" · ");
}

export function ActionBar({ onSearch, onRest, onFinalize, disabled, finalizeDisabled, suggestedAction, previews }: Props) {
  const suggestSearch = suggestedAction?.type === "SEARCH";
  const suggestRest = suggestedAction?.type === "REST";
  const searchPreview = findPreview(previews, "SEARCH");
  const restPreview = findPreview(previews, "REST");

  return (
    <section className="ow-action-dock">
      <div className="ow-action-track">
        <button
          type="button"
          className={`ow-action-pill ${suggestSearch ? "suggested" : ""}`}
          onClick={onSearch}
          disabled={disabled}
        >
          <span className="ow-action-icon" aria-hidden="true">
            S
          </span>
          <span className="ow-action-text">
            <strong>搜索</strong>
            <em>Search</em>
            {searchPreview && <small>{previewLine(searchPreview)}</small>}
          </span>
        </button>
        <button
          type="button"
          className={`ow-action-pill ${suggestRest ? "suggested" : ""}`}
          onClick={onRest}
          disabled={disabled}
        >
          <span className="ow-action-icon" aria-hidden="true">
            R
          </span>
          <span className="ow-action-text">
            <strong>休整</strong>
            <em>Rest</em>
            {restPreview && <small>{previewLine(restPreview)}</small>}
          </span>
        </button>
        <button type="button" className="ow-action-pill ow-action-finalize" onClick={onFinalize} disabled={disabled || finalizeDisabled}>
          <span className="ow-action-icon" aria-hidden="true">
            F
          </span>
          <span className="ow-action-text">
            <strong>立即结算</strong>
            <em>Finalize</em>
          </span>
        </button>
      </div>
    </section>
  );
}
