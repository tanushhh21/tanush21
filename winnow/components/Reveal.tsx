"use client";

import { m } from "motion/react";
import { EASE_OUT, VIEWPORT } from "./motion";

type Props = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
};

/**
 * Mask reveal from below. The observed element is the clipping parent:
 * the translated child sits outside the clip, so observing it would never fire.
 */
export default function Reveal({ children, delay = 0, className = "" }: Props) {
  return (
    <m.span
      className={`block overflow-hidden pb-[0.14em] -mb-[0.14em] ${className}`}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
    >
      <m.span
        className="reveal-child block"
        variants={{ hidden: { y: "105%" }, show: { y: "0%" } }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      >
        {children}
      </m.span>
    </m.span>
  );
}
