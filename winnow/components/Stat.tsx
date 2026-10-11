"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import Reveal from "./Reveal";
import { VIEWPORT } from "./motion";

const TARGET = 8;
const DURATION = 900;
// cubic-bezier(0.16, 1, 0.3, 1) is close to an exponential ease-out.
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export default function Stat() {
  const numRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  // Server HTML carries the final value, so the block is complete without JS.
  // Once hydrated (and only if motion is welcome), reset to zero until it is seen.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = numRef.current!;
    if (!inView) {
      el.textContent = "0";
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      el.textContent = String(Math.round(easeOut(t) * TARGET));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <section aria-label="Today" className="section-y bg-mist">
      <div className="wrap text-center">
        <m.p
          className="display-xl font-mono tabular-nums text-ink [word-spacing:-0.3em]"
          viewport={VIEWPORT}
          onViewportEnter={() => setInView(true)}
        >
          <Reveal>
            <span aria-hidden="true">
              <span ref={numRef}>{TARGET}</span> seconds
            </span>
            <span className="sr-only">{TARGET} seconds</span>
          </Reveal>
        </m.p>
        <p className="label mt-8">
          <Reveal delay={0.06}>per application, today</Reveal>
        </p>
      </div>
    </section>
  );
}
