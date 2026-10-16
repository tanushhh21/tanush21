"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll, type MotionValue } from "motion/react";
import Reveal from "./Reveal";
import { scroller } from "./SmoothScroll";
import { BOOKED, COL, LINES, ROWS, drawJourney, rowY, type Counts } from "@/lib/journey";

const STEPS = [
  {
    n: "01",
    title: "Source",
    kicker: "Inbound + outbound",
    line: "Applicants come to you. The best people often don't. We run both on every role, so nobody worth meeting is missed.",
  },
  {
    n: "02",
    title: "Evaluate",
    kicker: "Three filters, every candidate",
    line: "Your requirements, the signals a CV leaves out, and verification. Most candidates fall away. That is the point.",
  },
  {
    n: "03",
    title: "Shortlist",
    kicker: "Ranked, then booked",
    line: "What reaches you is short and ranked, with the reasons behind every place and interviews already in your calendar.",
  },
];
// Where each step begins on the scroll, and where the stepper jumps to.
const STARTS = [0, 0.34, 0.68];
const JUMP = [0.22, 0.56, 0.95];
// The still frame shown for each step when motion is reduced.
const STILL = [0.3, 0.58, 1];
const FILTERS = ["Your requirements", "Signals beyond the CV", "Verified"];
// Shorter labels for when the figure is small (narrow phones).
const FILTERS_SHORT = ["Requirements", "Beyond the CV", "Verified"];

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

/** A figure label that is visible while --p is between `from` and `to`. */
const win = (from: number, to: number) =>
  ({ opacity: `clamp(0, min(calc((var(--p) - ${from}) * 25), calc((${to} - var(--p)) * 25)), 1)` }) as React.CSSProperties;

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

/**
 * The process, drawn in dots (see lib/journey.ts). Live, it follows `progress`
 * with a little easing and idles while on screen; `still` draws one frame.
 */
function Figure({ progress, still }: { progress?: MotionValue<number>; still?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const applied = useRef<HTMLSpanElement>(null);
  const found = useRef<HTMLSpanElement>(null);
  const through = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const el = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let size = 0;
    let raf = 0;
    let shown = still ?? progress?.get() ?? 0;
    let last: Counts | null = null;
    const t0 = performance.now();

    const paint = (p: number, time: number) => {
      if (!size) return;
      const k = drawJourney(ctx, size, p, time);
      el.style.setProperty("--p", p.toFixed(4));
      if (k.applied !== last?.applied) applied.current!.textContent = String(k.applied);
      if (k.found !== last?.found) found.current!.textContent = String(k.found);
      k.through.forEach((n, i) => {
        if (n !== last?.through[i]) through.current[i]!.textContent = String(n);
      });
      last = k;
    };
    const resize = () => {
      size = el.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(shown, (performance.now() - t0) / 1000);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    if (still !== undefined || !progress) return () => ro.disconnect();

    const tick = (now: number) => {
      const target = progress.get();
      shown += (target - shown) * 0.16;
      if (Math.abs(target - shown) < 0.0005) shown = target;
      paint(shown, (now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [progress, still]);

  return (
    <div
      ref={wrap}
      className="journey-figure relative aspect-square w-full"
      style={{ "--p": still ?? 0 } as React.CSSProperties}
    >
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <div className="journey-labels absolute inset-0 text-[12.5px] leading-tight">
        {/* Source */}
        <div className="absolute left-0 top-0 grid gap-1.5" style={win(-1, 0.32)}>
          <span className="flex items-center gap-2 text-ink">
            <Dot className="bg-ink" />
            Applied
            <span ref={applied} className="font-mono tabular-nums text-slate">
              0
            </span>
          </span>
          <span className="flex items-center gap-2 text-signal">
            <Dot className="bg-signal" />
            Found, never applied
            <span ref={found} className="font-mono tabular-nums">
              0
            </span>
          </span>
          <span className="flex items-center gap-2 text-slate">
            <Dot className="bg-[#C3C8CF]" />
            Not a match
          </span>
        </div>
        <span className="absolute left-[42%] top-[71%] -translate-x-1/2 text-slate" style={win(0.08, 0.32)}>
          One pool
        </span>

        {/* Evaluate */}
        {FILTERS.map((f, i) => (
          <div
            key={f}
            className="absolute inset-x-[8%] flex -translate-y-full justify-between pb-1.5"
            style={{ top: `${LINES[i] * 100}%`, ...win(0.37, 0.66) }}
          >
            <span className="text-ink">
              <span className="jl-long">{f}</span>
              <span className="jl-short">{FILTERS_SHORT[i]}</span>
            </span>
            <span className="text-slate">
              <span ref={(e) => void (through.current[i] = e)} className="font-mono tabular-nums text-ink">
                0
              </span>
              <span className="jl-long"> through</span>
            </span>
          </div>
        ))}

        {/* Shortlist */}
        <span className="absolute top-[3%] text-slate" style={{ left: `${COL.bar0 * 100}%`, ...win(0.72, 2) }}>
          Ranked by fit
        </span>
        <span
          className="absolute top-[3%] -translate-x-1/2 text-slate"
          style={{ left: `${COL.glyph * 100}%`, ...win(0.84, 2) }}
        >
          Interview
        </span>
        {Array.from({ length: ROWS }, (_, i) => (
          <span
            key={i}
            className="absolute left-[3%] -translate-y-1/2 font-mono text-[11px] tabular-nums text-slate"
            style={{ top: `${rowY(i) * 100}%`, ...win(0.68 + 0.32 * (0.12 + i * 0.025), 2) }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
        ))}
        <div className="absolute inset-x-0 top-[90%] grid justify-items-center gap-1.5 text-center" style={win(0.9, 2)}>
          <span className="text-ink">
            Top {BOOKED} booked<span className="jl-long"> into your calendar</span>
          </span>
          <span className="flex items-center gap-2 text-signal">
            <Dot className="bg-signal" />
            No. 1 never applied.<span className="jl-long"> We found them.</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function StepText({ s, state }: { s: (typeof STEPS)[number]; state: number }) {
  return (
    <>
      <p className="text-[15px] font-medium text-signal">
        <Mask state={state}>{s.kicker}</Mask>
      </p>
      <h2 className="display-lg mt-2 text-ink">
        <Mask state={state} delay={40}>
          {s.title}
        </Mask>
      </h2>
      <p className="journey-line body-lg mt-4 max-w-[28rem]">
        <Mask state={state} delay={90}>
          {s.line}
        </Mask>
      </p>
    </>
  );
}

function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    fill.current!.style.transform = `scaleX(${p})`;
    const next = p >= STARTS[2] ? 2 : p >= STARTS[1] ? 1 : 0;
    setStep((s) => (s === next ? s : next));
  });

  const go = (i: number) => {
    const el = ref.current!;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scroller.to(top + (el.offsetHeight - window.innerHeight) * JUMP[i]);
  };

  return (
    <div ref={ref} className="relative h-[320vh] motion-reduce:hidden">
      <div className="sticky top-0 flex h-[100svh] items-center pt-16">
        <div className="journey-grid wrap w-full">
          <div>
            <nav aria-label="Steps" className="w-fit">
              <div className="flex gap-5 sm:gap-8">
                {STEPS.map((s, i) => (
                  <button
                    key={s.n}
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={`flex items-baseline gap-2 pb-3 text-[14px] font-medium transition-colors duration-300 sm:text-[15px] ${
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
            <div className="mt-6 grid md:mt-10">
              {STEPS.map((s, i) => (
                <div key={s.n} className="[grid-area:1/1]" aria-hidden={i !== step}>
                  <StepText s={s} state={i - step} />
                </div>
              ))}
            </div>
          </div>
          <div className="journey-fig">
            <Figure progress={scrollYProgress} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reduced motion: each step with a still frame of the figure. */
function StillSteps() {
  return (
    <div className="wrap hidden gap-20 pt-16 pb-[clamp(6rem,14vh,11rem)] motion-reduce:grid">
      {STEPS.map((s, i) => (
        <div key={s.n} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <span className="label block">{s.n} / 03</span>
            <div className="mt-4">
              <StepText s={s} state={0} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[28rem]">
            <Figure still={STILL[i]} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="how" aria-labelledby="how-heading" className="relative bg-paper">
      <div className="wrap pt-[clamp(6rem,14vh,11rem)] text-center">
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
      <StillSteps />
    </section>
  );
}
