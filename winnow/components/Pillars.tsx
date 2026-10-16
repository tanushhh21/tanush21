"use client";

import { useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import StepCard from "./StepCard";
import Reveal from "./Reveal";
import { scroller } from "./SmoothScroll";
import { useOnceInView } from "./how/useOnceInView";

const STEPS = [
  {
    n: "01",
    title: "Source",
    line: "We find the right people, whether or not they have applied.",
    happens: [
      "Your role goes live on LinkedIn, Naukri and campus platforms.",
      "We search databases and professional networks for people who fit.",
      "Applicants and sourced candidates arrive in one pool.",
    ],
    you: "Share the role. One message is enough.",
  },
  {
    n: "02",
    title: "Evaluate",
    line: "Every profile is read against what the role needs, not matched on keywords.",
    happens: [
      "Each candidate is scored on your requirements.",
      "We look past the CV for hidden signals.",
      "Identity and credentials are verified before any interview.",
    ],
    you: "Nothing. We handle it.",
  },
  {
    n: "03",
    title: "Shortlist",
    line: "A ranked shortlist, with the reasoning, and interviews already booked.",
    happens: [
      "See why each candidate ranks where they do.",
      "Interviews are booked around your calendar.",
      "Overrule any ranking, and the next shortlist improves.",
    ],
    you: "Interview, and make the offer.",
  },
];

type Step = (typeof STEPS)[number];

function Tick() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-[0.2em] h-4 w-4 shrink-0 text-signal">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

/** What happens in a step, and the client's part in it. `wrap` lets the pinned layout mask each line. */
function Details({ s, wrap = (_, c) => c }: { s: Step; wrap?: (i: number, c: React.ReactNode) => React.ReactNode }) {
  return (
    <>
      <ul className="mt-7 grid gap-3">
        {s.happens.map((h, i) => (
          <li key={h}>
            {wrap(
              i + 2,
              <span className="flex gap-3 text-[1.0625rem] leading-snug text-ink">
                <Tick />
                {h}
              </span>,
            )}
          </li>
        ))}
      </ul>
      <div className="mt-8 border-t border-hairline pt-5">
        {wrap(
          5,
          <p className="text-[15px] text-slate">
            Your part: <span className="font-medium text-ink">{s.you}</span>
          </p>,
        )}
      </div>
    </>
  );
}

function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);
  const live = useOnceInView(card, 0.3);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    fill.current!.style.transform = `scaleX(${p})`;
    const next = Math.min(2, Math.max(0, Math.floor(p * 3)));
    setStep((s) => (s === next ? s : next));
  });

  // Scroll to the middle of a step's stretch of the pinned section.
  const go = (i: number) => {
    const el = ref.current!;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scroller.to(top + (el.offsetHeight - window.innerHeight) * ((i + 0.5) / STEPS.length));
  };

  return (
    <div ref={ref} className="relative hidden h-[300vh] md:block motion-reduce:md:hidden">
      <div className="sticky top-0 flex h-[100svh] items-center pt-14">
        <div className="wrap grid grid-cols-[minmax(0,1fr)_minmax(0,27rem)] items-center gap-12 lg:gap-20">
          <div>
            <nav aria-label="Steps" className="w-fit">
              <div className="flex gap-8">
                {STEPS.map((s, i) => (
                  <button
                    key={s.n}
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={`flex items-baseline gap-2 pb-3 text-[15px] font-medium transition-colors duration-300 ${
                      i === step ? "text-ink" : "text-slate hover:text-ink"
                    }`}
                  >
                    <span className="font-mono text-[12px] tabular-nums">{s.n}</span>
                    {s.title}
                  </button>
                ))}
              </div>
              <span className="block h-px bg-hairline">
                <span ref={fill} className="block h-full origin-left bg-signal" style={{ transform: "scaleX(0)" }} />
              </span>
            </nav>

            <div className="mt-10 grid">
              {STEPS.map((s, i) => (
                <div key={s.n} className="[grid-area:1/1]" aria-hidden={i !== step}>
                  <h2 className="display-lg text-ink">
                    <Mask state={i - step}>{s.title}</Mask>
                  </h2>
                  <p className="body-lg mt-4 max-w-[30rem]">
                    <Mask state={i - step} delay={60}>
                      {s.line}
                    </Mask>
                  </p>
                  <Details
                    s={s}
                    wrap={(k, c) => (
                      <Mask state={i - step} delay={60 + k * 40}>
                        {c}
                      </Mask>
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
          <div ref={card}>
            <StepCard step={step} live={live} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StackedStep({ s, i }: { s: Step; i: number }) {
  const card = useRef<HTMLDivElement>(null);
  const live = useOnceInView(card, 0.35);
  return (
    <div className={i > 0 ? "mt-[clamp(5rem,12vh,8rem)]" : ""}>
      <span className="label block">
        {s.n} / 03
      </span>
      <h2 className="display-lg mt-4 text-ink">
        <Reveal>{s.title}</Reveal>
      </h2>
      <p className="body-lg mt-4">
        <Reveal delay={0.06}>{s.line}</Reveal>
      </p>
      <Details s={s} />
      <div ref={card} className="mt-10">
        <StepCard step={i} only={i} live={live} />
      </div>
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="how" aria-labelledby="how-heading" className="relative bg-paper">
      <div className="wrap pt-[clamp(6rem,14vh,11rem)] text-center md:pb-0">
        <h2 id="how-heading" className="display-lg mx-auto max-w-[22ch] text-ink">
          <Reveal>Everything between the role and the interview.</Reveal>
        </h2>
        <p className="body-lg mx-auto mt-5 max-w-[32rem]">
          <Reveal delay={0.06}>We source, evaluate and shortlist. You step in to interview and make the offer.</Reveal>
        </p>
        <div className="mt-8 flex justify-center">
          <a href="/how-we-work" className="btn-primary">
            See how we work
          </a>
        </div>
      </div>
      <Pinned />
      <div className="wrap pt-20 pb-[clamp(6rem,14vh,11rem)] md:hidden motion-reduce:md:block">
        {STEPS.map((s, i) => (
          <StackedStep key={s.n} s={s} i={i} />
        ))}
      </div>
    </section>
  );
}
