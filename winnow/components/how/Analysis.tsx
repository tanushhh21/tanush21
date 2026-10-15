"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./useOnceInView";

const POOL = 312;
const REQS = ["Go in production", "Distributed systems", "Postgres at scale", "On-call ownership"];

const CANDIDATES = [
  {
    id: "a",
    name: "Candidate A",
    source: "Sourced",
    score: 92,
    values: [95, 88, 94, 90],
    evidence: [
      "Built and ran a payments service handling two million transactions a day.",
      "Two years on the on-call rota, and led the team's incident reviews.",
    ],
    why: "Meets every core requirement, with the strongest record of running systems in production.",
    ask: "How would you shard the ledger if volume grew tenfold?",
  },
  {
    id: "b",
    name: "Candidate B",
    source: "Inbound",
    score: 88,
    values: [90, 96, 84, 52],
    evidence: [
      "Designed an event pipeline on Kafka that runs across three regions.",
      "No production on-call experience in any role so far.",
    ],
    why: "The strongest on distributed systems, but has never owned on-call. That gap places them below A.",
    ask: "Walk us through a production incident you helped resolve.",
  },
  {
    id: "c",
    name: "Candidate C",
    source: "Inbound",
    score: 81,
    values: [48, 80, 90, 88],
    evidence: [
      "Promoted to tech lead within three years, managing four engineers.",
      "Most backend work is in Java. Go appears only in side projects.",
    ],
    why: "Strong ownership and leadership. Go is a core requirement for this role, and it is the main gap.",
    ask: "How quickly have you become productive in a new language before?",
  },
];

const GAP = 60;

/**
 * The analysis behind each ranking. Bars morph between candidates; the text
 * for every candidate shares one grid cell, so switching never moves the page.
 * It steps through the candidates on its own until the visitor picks one.
 */
export default function Analysis() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    if (prefersReducedMotion()) {
      setShown(true);
      setAuto(false);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(e.isIntersecting);
        if (e.isIntersecting) setShown(true);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % CANDIDATES.length), 6000);
    return () => clearTimeout(id);
  }, [auto, visible, active]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
  };

  const c = CANDIDATES[active];

  return (
    <div
      ref={ref}
      data-pending={shown ? undefined : ""}
      className="mx-auto mt-14 max-w-[60rem] overflow-hidden rounded-[22px] border border-hairline bg-paper text-left shadow-lift"
    >
      <div role="tablist" aria-label="Candidates" className="grid grid-cols-3 gap-1 border-b border-hairline p-2 sm:flex sm:p-2.5">
        {CANDIDATES.map((k, i) => (
          <button
            key={k.id}
            id={`an-tab-${k.id}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls="an-panel"
            onClick={() => pick(i)}
            className={`relative flex items-center justify-center gap-2.5 overflow-hidden rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-200 ${
              i === active ? "bg-mist text-ink" : "text-slate hover:text-ink"
            }`}
          >
            <span>
              <span className="max-sm:sr-only">Candidate </span>
              {k.id.toUpperCase()}
            </span>
            <span className="font-mono text-[12.5px] tabular-nums">{k.score}</span>
            {/* Time until the next candidate, while it steps through them. */}
            {auto && visible && i === active ? (
              <span key={active} aria-hidden="true" className="an-timer absolute inset-x-4 bottom-1 h-px origin-left bg-signal/50" />
            ) : null}
          </button>
        ))}
      </div>

      <div id="an-panel" role="tabpanel" aria-labelledby={`an-tab-${c.id}`} className="grid md:grid-cols-2">
        <div className="border-b border-hairline p-6 sm:p-8 md:border-b-0 md:border-r">
          <div key={c.id} className="an-swap flex items-start justify-between gap-4">
            <div>
              <p className="text-[17px] font-medium text-ink">{c.name}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="rounded-full border border-hairline px-2.5 py-0.5 text-ink">{c.source}</span>
                <span className="rounded-full border border-signal/30 bg-signal/[0.06] px-2.5 py-0.5 text-signal">
                  Identity and employment verified
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[2rem] font-medium leading-none tabular-nums tracking-[-0.04em] text-ink">{c.score}</p>
              <p className="mt-1.5 text-[12.5px] text-slate">
                Rank {active + 1} of {POOL}
              </p>
            </div>
          </div>

          <p className="eyebrow mt-9 !text-[15px]">Against your requirements</p>
          <ul className="mt-4 grid gap-4">
            {REQS.map((r, i) => {
              const v = c.values[i];
              const gap = v < GAP;
              return (
                <li key={r}>
                  <div className="flex items-baseline justify-between text-[14px]">
                    <span className={gap ? "text-slate" : "text-ink"}>{r}</span>
                    <span className="font-mono text-[12.5px] tabular-nums text-slate">{gap ? `Gap · ${v}` : v}</span>
                  </div>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-mist">
                    <span
                      className={`an-bar block h-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-out-expo ${
                        gap ? "bg-slate/35" : "bg-ink"
                      }`}
                      style={{ transform: `scaleX(${v / 100})`, transitionDelay: `${i * 60}ms` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid bg-mist/60 p-6 sm:p-8">
          {CANDIDATES.map((k, i) => (
            <div
              key={k.id}
              aria-hidden={i !== active}
              className={`col-start-1 row-start-1 transition-[opacity,transform,visibility] duration-500 ${
                i === active ? "visible translate-y-0 opacity-100" : "invisible translate-y-1.5 opacity-0"
              }`}
            >
              <p className="eyebrow !text-[15px]">Evidence</p>
              <ul className="mt-3 grid gap-2.5">
                {k.evidence.map((e) => (
                  <li key={e} className="flex gap-3 text-[14.5px] leading-snug text-ink">
                    <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                    {e}
                  </li>
                ))}
              </ul>
              <p className="eyebrow mt-7 !text-[15px]">Why this rank</p>
              <p className="mt-2 text-[14.5px] leading-snug text-ink">{k.why}</p>
              <p className="eyebrow mt-7 !text-[15px]">Worth asking in the interview</p>
              <p className="mt-2 text-[14.5px] leading-snug text-ink">&ldquo;{k.ask}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
