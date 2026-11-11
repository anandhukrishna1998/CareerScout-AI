"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface MotionRevealProps {
  delay?: number;
  children: ReactNode;
  className?: string;
}

export function MotionReveal({ delay = 0, children, className }: MotionRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeDelay = Number.isFinite(delay) && delay > 0 ? delay : 0;

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.18,
        delay: safeDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
