"use client";

import { useRef } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";

/**
 * A tall section that publishes its pinned scroll progress as the CSS
 * variable --p (0 at the top, 1 at the end). Children animate in CSS from
 * that one value, so they need no JavaScript of their own.
 */
export default function ScrollVar({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => ref.current!.style.setProperty("--p", p.toFixed(4)));
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
