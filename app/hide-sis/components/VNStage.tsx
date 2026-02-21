"use client";

import { motion } from "framer-motion";
import type { BackgroundKey, CameraKey } from "../content/scenes";

type Props = {
  backgroundKey: BackgroundKey;
  camera: CameraKey;
  children: React.ReactNode;
};

const bgClassMap: Record<BackgroundKey, string> = {
  manor: "bg-manor",
  memory_vault: "bg-memory",
  rooftop: "bg-rooftop",
};

const cameraAnim: Record<CameraKey, { scale: number; x: number; y: number; rotate: number }> = {
  still: { scale: 1, x: 0, y: 0, rotate: 0 },
  push: { scale: 1.03, x: 0, y: -4, rotate: 0 },
  drift: { scale: 1.02, x: 6, y: -3, rotate: 0 },
  shake: { scale: 1.01, x: -3, y: 2, rotate: -0.3 },
  stamp: { scale: 1.05, x: 0, y: 0, rotate: 0 },
};

export function VNStage({ backgroundKey, camera, children }: Props) {
  return (
    <motion.section
      key={`${backgroundKey}-${camera}`}
      className={`vn-stage ${bgClassMap[backgroundKey]}`}
      animate={cameraAnim[camera]}
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      <div className="vn-fog" />
      <div className="vn-red-thread" />
      {children}
    </motion.section>
  );
}
