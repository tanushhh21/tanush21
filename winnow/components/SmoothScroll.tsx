"use client";

import { useEffect } from "react";
import { cancelFrame, frame } from "motion/react";

/**
 * Lenis drives the native window scroll, so motion's useScroll reads it directly.
 * Lenis is ticked from motion's own frame loop so both share one RAF.
 * It is not needed for first paint, so it loads after hydration.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || touch) return;

    let cancelled = false;
    let teardown = () => {};

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
        syncTouch: false, // Lenis's successor to smoothTouch: never force smooth scroll on touch
        anchors: true,
      });
      const update = ({ timestamp }: { timestamp: number }) => lenis.raf(timestamp);
      frame.update(update, true);
      teardown = () => {
        cancelFrame(update);
        lenis.destroy();
      };
    });

    return () => {
      cancelled = true;
      teardown();
    };
  }, []);

  return null;
}
