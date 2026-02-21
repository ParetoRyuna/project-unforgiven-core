"use client";

import type { CSSProperties } from "react";
import type { Action, Location } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

const nodeLayout = [
  { x: 14, y: 30 },
  { x: 38, y: 26 },
  { x: 62, y: 30 },
  { x: 82, y: 36 },
  { x: 22, y: 52 },
  { x: 46, y: 56 },
  { x: 70, y: 58 },
  { x: 86, y: 62 },
  { x: 30, y: 78 },
  { x: 56, y: 80 },
  { x: 78, y: 82 },
];

const zoneLabels = [
  { x: 16, y: 24, cn: "旧宅北侧", en: "North Manor" },
  { x: 52, y: 22, cn: "审讯回廊", en: "Interrogation Wing" },
  { x: 24, y: 66, cn: "秘语花园", en: "Whisper Garden" },
  { x: 76, y: 72, cn: "风暴顶层", en: "Storm Roof" },
];

const edges: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 5],
  [3, 4],
  [4, 5],
  [3, 6],
  [5, 7],
];

type Props = {
  locations: Location[];
  currentId: string;
  onMove: (locationId: string) => void;
  suggestedAction?: Action | null;
};

export function WorldMap({ locations, currentId, onMove, suggestedAction }: Props) {
  const positions = locations.map((loc, idx) => ({
    ...loc,
    pos: nodeLayout[idx % nodeLayout.length],
  }));

  const activeEdges = edges.filter(([from, to]) => from < positions.length && to < positions.length);

  return (
    <div className="ow-map">
      <svg className="ow-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {activeEdges.map(([from, to]) => {
          const start = positions[from];
          const end = positions[to];
          if (!start || !end) return null;
          return <line key={`${start.id}-${end.id}`} x1={start.pos.x} y1={start.pos.y} x2={end.pos.x} y2={end.pos.y} />;
        })}
      </svg>

      <div className="ow-zones" aria-hidden="true">
        {zoneLabels.map((zone) => (
          <div
            key={zone.en}
            className="ow-zone"
            style={
              {
                "--x": `${zone.x}%`,
                "--y": `${zone.y}%`,
              } as CSSProperties
            }
          >
            <span>{zone.cn}</span>
            <em>{zone.en}</em>
          </div>
        ))}
      </div>
      {positions.map((loc) => {
        const isSuggested = suggestedAction?.type === "MOVE" && suggestedAction.target_id === loc.id;
        const isCurrent = loc.id === currentId;
        const isDanger = loc.danger >= 4;
          return (
            <button
              key={loc.id}
              type="button"
              className={`ow-node ${isCurrent ? "current" : ""} ${isSuggested ? "suggested" : ""} ${isDanger ? "danger" : ""}`}
              onClick={() => onMove(loc.id)}
            style={
              {
                "--x": `${loc.pos.x}%`,
                "--y": `${loc.pos.y}%`,
              } as CSSProperties
            }
            >
              <span className="ow-node-dot" aria-hidden="true" />
              <span className="ow-node-title">{loc.name}</span>
              <span className="ow-node-tags">{loc.tags.slice(0, 2).join(" · ")}</span>
              <span className="ow-node-danger">Danger {loc.danger}</span>
              <span className="ow-node-hint">{isCurrent ? "当前位置 · Current" : "可探索 · Unexplored"}</span>
            </button>
          );
      })}
    </div>
  );
}
