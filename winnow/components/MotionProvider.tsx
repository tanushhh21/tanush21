"use client";

import { LazyMotion, domAnimation } from "motion/react";

// Reduced motion is handled in CSS (reveals) and per component (canvas, counters).
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
