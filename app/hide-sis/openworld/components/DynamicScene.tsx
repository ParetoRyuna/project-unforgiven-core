"use client";

import type { ScenePayload } from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";

type Props = {
  scene: ScenePayload | null;
};

export function DynamicScene({ scene }: Props) {
  if (!scene) return null;
  return (
    <section className="ow-scene">
      {scene.beats.map((beat, idx) => (
        <div key={`${idx}-${beat.cn}`} className="ow-beat">
          <div className="ow-beat-header">
            <span className="ow-beat-speaker">{beat.speaker}</span>
            <span className="ow-beat-emotion">{beat.emotion}</span>
          </div>
          <p className="ow-beat-cn">{beat.cn}</p>
          <p className="ow-beat-en">{beat.en}</p>
        </div>
      ))}
    </section>
  );
}
