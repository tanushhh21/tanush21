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
    <section aria-label="The problem" className="section-y bg-mist">
      <div className="wrap flex flex-col items-center text-center">
        <p className="label">
          <Reveal>A résumé&rsquo;s first look, today</Reveal>
        </p>
        <m.p
          className="display-xl mt-8 font-mono tabular-nums text-ink [word-spacing:-0.3em]"
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
        <p className="body-lg mt-10 max-w-[36rem]">
          <Reveal delay={0.06}>
            That is how long most applications get before a yes or no. Great people are skipped
            for a missing keyword, and the best are rarely applying at all.
          </Reveal>
        </p>
        <p className="mt-6 max-w-[36rem] text-[clamp(1.0625rem,1.4vw,1.3rem)] font-medium text-ink">
          <Reveal delay={0.12}>Winnow reads every profile in full, and goes looking for the rest.</Reveal>
        </p>
      </div>
    </section>
  );
}
