"use client";

import { useEffect, useState, type RefObject } from "react";

/** True once the element is 15% into the viewport; stays true. */
export function useOnceInView(ref: RefObject<Element | null>, amount = 0.15) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: amount },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, seen]);
  return seen;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// cubic-bezier(0.16, 1, 0.3, 1) is close to an exponential ease-out.
export const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
