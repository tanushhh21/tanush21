"use client";

import { useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import PillarFigure, { StaticFigure } from "./PillarFigure";
import Reveal from "./Reveal";

const STEPS = [
  { n: "01", title: "Source", line: "We search across databases to find ideal candidates, even those who have not applied yet." },
  { n: "02", title: "Evaluate", line: "We find the hidden signals a CV misses, then verify what matters." },
  { n: "03", title: "Shortlist", line: "A ranked list with clear reasoning, and interviews scheduled." },
];

function Mask({ state, delay = 0, children }: { state: number; delay?: number; children: React.ReactNode }) {
  // state < 0: already passed (masked out upwards); 0: current; > 0: still to come.
  const y = state < 0 ? "-105%" : state > 0 ? "105%" : "0%";
  return (
    <span className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
      <span
        className="block transition-transform duration-400 ease-out-expo"
        style={{ transform: `translateY(${y})`, transitionDelay: state === 0 ? `${delay}ms` : "0ms" }}
      >
        {children}
      </span>
    </span>
  );
}

function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(2, Math.max(0, Math.floor(p * 3)));
    setStep((s) => (s === next ? s : next));
  });

  return (
    <div ref={ref} className="relative hidden h-[300vh] md:block motion-reduce:md:hidden">
      <div className="sticky top-0 flex h-[100svh] items-center">
        <ol
          aria-hidden="true"
          className="absolute left-[max(16px,calc((100%-1180px)/2-24px))] top-1/2 flex -translate-y-1/2 flex-col gap-2"
        >
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className={`h-12 w-[2px] transition-colors duration-300 ease-standard ${i === step ? "bg-signal" : "bg-hairline"}`}
            />
          ))}
        </ol>
        <div className="wrap grid grid-cols-2 items-center gap-16 pl-14! xl:pl-6!">
          <div className="grid">
            {STEPS.map((s, i) => (
              <div key={s.n} className="[grid-area:1/1]" aria-hidden={i !== step}>
                <Mask state={i - step}>
                  <span className="label">{s.n}</span>
                </Mask>
                <h2 className="display-lg mt-6 text-ink">
                  <Mask state={i - step} delay={30}>
                    {s.title}
                  </Mask>
                </h2>
                <p className="body-lg mt-5">
                  <Mask state={i - step} delay={90}>
                    {s.line}
                  </Mask>
                </p>
              </div>
            ))}
          </div>
          <div className="ml-auto w-full max-w-[440px]">
            <PillarFigure step={step} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stacked() {
  return (
    <div className="wrap">
      {STEPS.map((s, i) => (
        <div key={s.n} className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${i > 0 ? "mt-[clamp(5rem,12vh,9rem)]" : ""}`}>
          <div className="mx-auto w-full max-w-[320px] md:order-2 md:max-w-[440px]">
            <StaticFigure step={i} />
          </div>
          <div>
            <span className="label block">{s.n}</span>
            <h2 className="display-lg mt-5 text-ink">
              <Reveal>{s.title}</Reveal>
            </h2>
            <p className="body-lg mt-4">
              <Reveal delay={0.06}>{s.line}</Reveal>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="how" aria-label="How it works" className="relative bg-paper">
      <Pinned />
      <div className="section-y md:hidden motion-reduce:md:block">
        <Stacked />
      </div>
    </section>
  );
}
