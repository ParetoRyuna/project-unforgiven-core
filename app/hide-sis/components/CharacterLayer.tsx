"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { resolveCharacterSourceCandidates, type CharacterEmotion, type CharacterId } from "../assets/characters.manifest";

type CharacterState = {
  character: CharacterId;
  emotion: CharacterEmotion;
  active: boolean;
};

type Props = {
  left: CharacterState;
  right: CharacterState;
};

function Portrait({ character, emotion, active, side }: CharacterState & { side: "left" | "right" }) {
  const sources = resolveCharacterSourceCandidates(character, emotion);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [character, emotion]);

  return (
    <motion.div
      className={`portrait-wrap ${side} character-${character} ${active ? "active" : "inactive"}`}
      animate={{ opacity: active ? 1 : 0.58, scale: active ? 1.03 : 0.98, y: active ? 0 : 8 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sources[idx] ?? sources[sources.length - 1]}
        alt={`${character}-${emotion}`}
        className="portrait-img"
        onError={() => {
          if (idx < sources.length - 1) setIdx(idx + 1);
        }}
      />
      <div className="portrait-vignette" />
      <div className="portrait-name">{character === "picha" ? "Picha" : "Baibua"}</div>
    </motion.div>
  );
}

export function CharacterLayer({ left, right }: Props) {
  return (
    <div className="character-layer">
      <Portrait side="left" {...left} />
      <Portrait side="right" {...right} />
    </div>
  );
}
