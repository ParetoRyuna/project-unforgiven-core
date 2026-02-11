"use client";

import { useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";

export interface CountUpProps {
  value: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/** 数字从当前值过渡到目标值（类似 slot machine 计数效果） */
export function CountUp({
  value,
  decimals = 2,
  className = "",
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const spring = useSpring(value, { stiffness: 80, damping: 25 });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(v));
    return () => unsub();
  }, [spring]);

  const formatted = Number.isFinite(display)
    ? display.toFixed(decimals)
    : "0.00";

  return (
    <motion.span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </motion.span>
  );
}
