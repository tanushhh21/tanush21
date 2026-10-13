"use client";

import { useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import PillarFigure, { StaticFigure } from "./PillarFigure";
import Reveal from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Source",
    line: "Every channel, one pipeline.",
    body: "We go well past your inbound. LinkedIn, GitHub, Naukri, referrals and alumni networks are searched together, de-duplicated, and built into one pipeline for the role.",
    details: [
      "Passive candidates, not only applicants",
      "One profile per person, every source merged",
      "The search widens until the bar is met",
    ],
  },
  {
    n: "02",
    title: "Evaluate",
    line: "Read like your best recruiter would.",
    body: "Every profile is read in full against a rubric we agree with you: what they have shipped, how they have grown, and what they would bring. Keywords are where we start, not where we stop.",
    details: [
      "Your rubric, written down on day one",
      "Evidence quoted from the profile",
      "Notice period and CTC checked early",
    ],
  },
  {
    n: "03",
    title: "Shortlist",
    line: "Ten names, and why.",
    body: "You get ten people, each with the reasons they made it and the risks worth probing. We have already reached out, confirmed interest and found time for a first conversation.",
    details: [
      "Reasons and risks, never a bare score",
      "Interest confirmed before you see them",
      "First conversations booked for you",
    ],
  },
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

function Details({ items }: { items: string[] }) {
  return (
    <ul className="grid border-t border-hairline">
      {items.map((d) => (
        <li key={d} className="flex items-center gap-3 border-b border-hairline py-3 text-[15px] text-ink">
          <span aria-hidden="true" className="h-px w-3 bg-slate" />
          {d}
        </li>
      ))}
    </ul>
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
              className={`h-12 w-[2px] transition-colors duration-300 ease-standard ${
                i === step ? "bg-signal" : "bg-hairline"
              }`}
            />
          ))}
        </ol>
        <div className="wrap grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-16 pl-14! xl:pl-6!">
          <div className="grid">
            {STEPS.map((s, i) => (
              <div key={s.n} className="[grid-area:1/1]" aria-hidden={i !== step}>
                <Mask state={i - step}>
                  <span className="label">
                    How it works <span className="mx-2 text-hairline">/</span>
                    <span className="text-ink">{s.n}</span> of 03
                  </span>
                </Mask>
                <h2 className="display-lg mt-6 text-ink">
                  <Mask state={i - step} delay={30}>
                    {s.title}
                  </Mask>
                </h2>
                <p className="mt-3 text-[clamp(1.25rem,1.8vw,1.6rem)] font-medium tracking-[-0.015em] text-ink">
                  <Mask state={i - step} delay={60}>
                    {s.line}
                  </Mask>
                </p>
                <p className="body-lg mt-5 max-w-[34rem]">
                  <Mask state={i - step} delay={90}>
                    {s.body}
                  </Mask>
                </p>
                <div className="mt-8 max-w-[34rem]">
                  <Mask state={i - step} delay={120}>
                    <Details items={s.details} />
                  </Mask>
                </div>
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
      <span className="label block">How it works</span>
      {STEPS.map((s, i) => (
        <div
          key={s.n}
          className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${i > 0 ? "mt-[clamp(5rem,12vh,9rem)]" : "mt-12"}`}
        >
          <div className="mx-auto w-full max-w-[320px] md:order-2 md:max-w-[440px]">
            <StaticFigure step={i} />
          </div>
          <div>
            <span className="label block">
              <span className="text-ink">{s.n}</span> of 03
            </span>
            <h2 className="display-lg mt-5 text-ink">
              <Reveal>{s.title}</Reveal>
            </h2>
            <p className="mt-3 text-[1.25rem] font-medium tracking-[-0.015em] text-ink">
              <Reveal delay={0.06}>{s.line}</Reveal>
            </p>
            <p className="body-lg mt-4">
              <Reveal delay={0.12}>{s.body}</Reveal>
            </p>
            <div className="mt-7">
              <Details items={s.details} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="how" aria-label="How it works" className="relative scroll-mt-0 bg-paper">
      <Pinned />
      <div className="section-y md:hidden motion-reduce:md:block">
        <Stacked />
      </div>
    </section>
  );
}
