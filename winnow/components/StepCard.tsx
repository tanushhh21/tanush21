"use client";

import { useEffect, useState } from "react";
import { Mark } from "./Logo";
import { easeOut, prefersReducedMotion } from "./how/useOnceInView";

const STATUS = ["Sourcing", "Evaluating", "Shortlist ready"];

const CHANNELS = [
  { name: "LinkedIn", n: 128 },
  { name: "Naukri", n: 141 },
  { name: "Campus placement cells", n: 43 },
  { name: "Databases and networks", n: 84, sourced: true },
];
const POOL = CHANNELS.reduce((a, c) => a + c.n, 0);
const MAX = Math.max(...CHANNELS.map((c) => c.n));

const REQS = ["Go in production", "Distributed systems", "Postgres at scale", "On-call ownership"];
const CHECKS = ["Identity", "Employment", "Degree"];

const SHORTLIST = [
  { name: "Candidate A", score: 92, why: "Ran payments infrastructure at scale.", slot: "Tue 11:00" },
  { name: "Candidate B", score: 88, why: "Designed a multi-region event pipeline.", slot: "Wed 15:00" },
  { name: "Candidate C", score: 81, why: "Tech lead within three years.", slot: "Thu 10:00" },
];

/** Counts up to target each time `on` turns true. Shows the target otherwise. */
function useCountUp(target: number, on: boolean, ms = 1100) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (!on || prefersReducedMotion()) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      setV(Math.round(easeOut(t) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, target, ms]);
  return v;
}

/** Fades and lifts in with a delay while on; snaps back while off, so it replays. */
const enter = (on: boolean) =>
  `transition-[opacity,transform] ease-out-expo ${on ? "opacity-100 translate-y-0 duration-700" : "opacity-0 translate-y-2 duration-0"}`;
const after = (on: boolean, ms: number) => ({ transitionDelay: on ? `${ms}ms` : "0ms" });

function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-4 w-4 shrink-0 ${className}`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Source({ on }: { on: boolean }) {
  const pool = useCountUp(POOL, on);
  return (
    <div>
      <p className="text-[13px] text-slate">Candidates in one pool</p>
      <p className="mt-1 font-mono text-[2.75rem] font-medium leading-none tabular-nums tracking-[-0.04em] text-ink">{pool}</p>
      <ul className="mt-7 grid gap-4">
        {CHANNELS.map((c, i) => (
          <li key={c.name} className={enter(on)} style={after(on, 120 + i * 110)}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="text-ink">{c.name}</span>
              <span className={`font-mono text-[12.5px] tabular-nums ${c.sourced ? "text-signal" : "text-slate"}`}>
                {c.n} {c.sourced ? "sourced" : "applied"}
              </span>
            </div>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-mist">
              <span
                className={`block h-full origin-left rounded-full transition-transform ease-out-expo ${c.sourced ? "bg-signal" : "bg-ink"} ${
                  on ? "duration-1000" : "duration-0"
                }`}
                style={{ transform: `scaleX(${on ? c.n / MAX : 0})`, ...after(on, 220 + i * 110) }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-6 flex items-center gap-2 text-[13px] text-slate ${enter(on)}`} style={after(on, 800)}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
        84 strong candidates who had not applied
      </p>
    </div>
  );
}

function Evaluate({ on }: { on: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-medium text-ink">Candidate A</p>
        <span className="rounded-full border border-hairline px-2.5 py-0.5 text-[12.5px] text-ink">Sourced</span>
      </div>
      <p className="mt-1 text-[13px] text-slate">Profile, projects and work history read in full</p>
      <ul className="mt-5 grid gap-2.5">
        {REQS.map((r, i) => (
          <li key={r} className="flex items-center justify-between gap-3 text-[14px] text-ink">
            {r}
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full bg-ink text-paper transition-[opacity,transform] ease-out-expo ${
                on ? "scale-100 opacity-100 duration-500" : "scale-50 opacity-0 duration-0"
              }`}
              style={after(on, 150 + i * 160)}
            >
              <Tick className="!h-3 !w-3" />
            </span>
          </li>
        ))}
      </ul>
      <div
        className={`mt-5 rounded-[14px] border border-signal/20 bg-signal/[0.05] px-4 py-3 ${enter(on)}`}
        style={after(on, 850)}
      >
        <p className="text-[12.5px] font-medium text-signal">Hidden signal</p>
        <p className="mt-1 text-[14px] leading-snug text-ink">Maintains an open-source Go library that other teams run in production.</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {CHECKS.map((c, i) => (
          <span
            key={c}
            className={`inline-flex items-center gap-1 rounded-full border border-signal/30 bg-signal/[0.06] px-2.5 py-0.5 text-[12.5px] text-signal ${enter(on)}`}
            style={after(on, 1150 + i * 120)}
          >
            <Tick className="!h-3 !w-3" />
            {c}
          </span>
        ))}
        <span className={`ml-1 text-[12.5px] text-slate ${enter(on)}`} style={after(on, 1550)}>
          Verified before any interview
        </span>
      </div>
    </div>
  );
}

function Shortlist({ on }: { on: boolean }) {
  return (
    <div>
      <p className="text-[13px] text-slate">Ranked, with the reasoning</p>
      <ol className="mt-4 grid gap-2.5">
        {SHORTLIST.map((r, i) => (
          <li
            key={r.name}
            className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-[14px] border border-hairline px-3.5 py-3 ${enter(on)}`}
            style={after(on, 100 + i * 140)}
          >
            <span className="pt-0.5 font-mono text-[12px] tabular-nums text-slate">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium text-ink">{r.name}</span>
              <span className="mt-0.5 block truncate text-[13px] text-slate">{r.why}</span>
              <span
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full bg-signal px-2.5 py-0.5 text-[12px] font-medium text-paper transition-[opacity,transform] ease-out-expo ${
                  on ? "scale-100 opacity-100 duration-500" : "scale-90 opacity-0 duration-0"
                }`}
                style={after(on, 700 + i * 160)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                  <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Interview · {r.slot}
              </span>
            </span>
            <span className="font-mono text-[1.375rem] font-medium leading-none tabular-nums tracking-[-0.03em] text-ink">{r.score}</span>
          </li>
        ))}
      </ol>
      <p className={`mt-5 flex items-center gap-2 text-[13px] text-slate ${enter(on)}`} style={after(on, 1250)}>
        <Tick className="text-signal" />
        12 interviews booked around your calendar
      </p>
    </div>
  );
}

const PANELS = [Source, Evaluate, Shortlist];

/**
 * The home page's product view: one role card that shows what Winnow is doing
 * at each step. With `only`, it shows a single step (stacked layout); without,
 * all three share one grid cell and crossfade, so the card never changes size.
 */
export default function StepCard({ step, live, only }: { step: number; live: boolean; only?: number }) {
  const shown = only === undefined ? [0, 1, 2] : [only];
  const current = only ?? step;
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[24px] border border-hairline bg-paper text-left shadow-[0_1px_2px_rgb(10_12_15/0.06),0_24px_48px_-24px_rgb(10_12_15/0.18)]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Mark className="h-3.5 w-auto text-ink" />
          <span className="font-display text-[15px] font-semibold text-ink">Backend Engineer</span>
        </div>
        <span className="flex items-center gap-2 text-[13px] text-slate">
          <span className={`h-2 w-2 rounded-full ${current === 2 ? "bg-ink" : "animate-pulse bg-signal"}`} />
          {STATUS[current]}
        </span>
      </div>
      <div className="grid p-5 sm:p-6">
        {shown.map((i) => {
          const Panel = PANELS[i];
          const active = i === current;
          return (
            <div
              key={i}
              className={`col-start-1 row-start-1 transition-[opacity,visibility] duration-500 ${active ? "opacity-100" : "invisible opacity-0"}`}
            >
              <Panel on={live && active} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
