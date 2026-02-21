"use client";

import { useEffect, useState } from "react";

import { getSfxEnabled, setSfxEnabled, unlockSfx } from "../audio/sfx";

type Props = {
  onReady?: () => void;
};

export function SfxController({ onReady }: Props) {
  const [enabled, setEnabled] = useState(getSfxEnabled());

  useEffect(() => {
    const unlock = async () => {
      await unlockSfx();
      onReady?.();
    };
    const listener = () => {
      unlock();
      window.removeEventListener("pointerdown", listener);
    };
    window.addEventListener("pointerdown", listener, { once: true });
    return () => window.removeEventListener("pointerdown", listener);
  }, [onReady]);

  return (
    <button
      type="button"
      className={`sfx-toggle ${enabled ? "on" : "off"}`}
      onClick={async () => {
        await unlockSfx();
        setSfxEnabled(!enabled);
        setEnabled(!enabled);
      }}
    >
      SFX {enabled ? "ON" : "OFF"}
    </button>
  );
}
