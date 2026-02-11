"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/** 入场动画：淡入 + 上滑，用于列表/卡片 */
const defaultEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

/** 按钮按压反馈 */
export const tapScale = { whileTap: { scale: 0.98 } };

export interface MotionDivProps extends HTMLMotionProps<"div"> {
  /** 使用预设入场动画 */
  entrance?: boolean;
}

export function MotionDiv({ entrance, initial, animate, transition, ...props }: MotionDivProps) {
  return (
    <motion.div
      initial={entrance ? defaultEntrance.initial : initial}
      animate={entrance ? defaultEntrance.animate : animate}
      transition={transition ?? { duration: 0.3, ease: "easeOut" }}
      {...props}
    />
  );
}

export { motion };
