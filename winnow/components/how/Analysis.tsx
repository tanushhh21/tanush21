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
    why: "Meets every core requirement, with the strongest record of running systems in production. Has owned a payments workload of the size this role takes on.",
    practical: [
      ["Location", "Bengaluru"],
      ["Notice period", "30 days"],
      ["Expected CTC", "Within your budget"],
    ],
    more: ["4 roles over 6 years", "A payments design doc and two repositories", "First on the shortlist for production experience"],
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
    why: "The strongest on distributed systems in the pool. Has never owned on-call, which is a core part of this role, so ranks below A.",
    practical: [
      ["Location", "Pune, open to relocating"],
      ["Notice period", "60 days"],
      ["Expected CTC", "Within your budget"],
    ],
    more: ["3 roles over 5 years", "A Kafka pipeline repository and a conference talk", "First on the shortlist for distributed systems"],
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
    why: "Strong ownership and the fastest growth in the pool. Go is a core requirement for this role and the main gap, which places them third.",
    practical: [
      ["Location", "Bengaluru"],
      ["Notice period", "15 days left on notice"],
      ["Expected CTC", "8% above your budget"],
    ],
    more: ["2 roles over 4 years", "Java services and the reviews they led as tech lead", "Fastest growth on the shortlist"],
  },
];

const GAP = 60;
const CHECKS = ["Identity", "Employment", "Degree"];
// The rest of the report, shown only as a glimpse. Each candidate has a line for the
// first three sections; verification reads the same for everyone.
const MORE = ["Career timeline", "Work reviewed", "How they compare", "Verification details"];
const VERIFIED_FROM = "Identity, employment and degree, with sources";

/**
 * The detailed report behind each shortlisted candidate. Bars morph between
 * candidates; the text for every candidate shares one grid cell, so switching
 * never moves the page. It steps through the candidates on its own until the
 * visitor picks one, or opens a report from the ranked list (#report-a etc.).
 */
export default function Analysis() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const [asked, setAsked] = useState(false);

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
      { threshold: 0.2 },
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

  useEffect(() => {
    const open = (id: string) => {
      const i = CANDIDATES.findIndex((k) => k.id === id);
      if (i >= 0) pick(i);
    };
    const fromHash = () => open(window.location.hash.match(/^#report-(\w)$/)?.[1] ?? "");
    const fromLink = (e: Event) => open((e as CustomEvent<string>).detail);
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("open-report", fromLink);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("open-report", fromLink);
    };
  }, []);

  const c = CANDIDATES[active];

  return (
    <div
      ref={ref}
      data-pending={shown ? undefined : ""}
      className="relative mx-auto mt-14 max-w-[60rem] rounded-[22px] border border-hairline bg-paper text-left shadow-lift"
    >
      {/* Link targets, set above the card so it is not hidden under the nav. */}
      {CANDIDATES.map((k) => (
        <span key={k.id} id={`report-${k.id}`} aria-hidden="true" className="absolute -top-24" />
      ))}
      <div role="tablist" aria-label="Candidates" className="grid grid-cols-3 gap-1 rounded-t-[22px] border-b border-hairline p-2 sm:flex sm:p-2.5">
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
              <p className="label">Detailed report</p>
              <p className="mt-2 text-[17px] font-medium text-ink">{c.name}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="rounded-full border border-hairline px-2.5 py-0.5 text-ink">{c.source}</span>
                <span className="rounded-full border border-signal/30 bg-signal/[0.06] px-2.5 py-0.5 text-signal">Verified</span>
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
              <p className="eyebrow !text-[15px]">Why they fit</p>
              <p className="mt-2 text-[14.5px] leading-snug text-ink">{k.why}</p>
              <p className="eyebrow mt-7 !text-[15px]">Evidence</p>
              <ul className="mt-3 grid gap-2.5">
                {k.evidence.map((e) => (
                  <li key={e} className="flex gap-3 text-[14.5px] leading-snug text-ink">
                    <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                    {e}
                  </li>
                ))}
              </ul>
              <p className="eyebrow mt-7 !text-[15px]">Practical fit</p>
              <dl className="mt-3 grid gap-2 text-[14px]">
                {k.practical.map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2 last:border-b-0">
                    <dt className="text-slate">{term}</dt>
                    <dd className="text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="eyebrow mt-7 !text-[15px]">Verified</p>
              <p className="mt-3 flex flex-wrap gap-1.5 text-[12.5px]">
                {CHECKS.map((ch) => (
                  <span key={ch} className="inline-flex items-center gap-1 rounded-full border border-signal/30 bg-signal/[0.06] px-2.5 py-0.5 text-signal">
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {ch}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* The rest of the report, as a glimpse that fades out. */}
      <div className="rounded-b-[22px] border-t border-hairline px-6 pb-6 pt-6 sm:px-8 sm:pb-7">
        <div key={c.id} aria-hidden="true" className="an-swap an-more grid h-44 gap-x-10 gap-y-6 overflow-hidden sm:h-[8.5rem] sm:grid-cols-2">
          {MORE.map((m, i) => (
            <div key={m}>
              <p className="eyebrow !text-[15px]">{m}</p>
              <p className="mt-1.5 text-[14px] leading-snug text-ink">{c.more[i] ?? VERIFIED_FROM}</p>
              <span className="mt-3 block h-2 rounded-full bg-mist" />
              <span className="mt-2 block h-2 w-3/4 rounded-full bg-mist" />
            </div>
          ))}
        </div>
        <div aria-live="polite" className="mt-2 flex min-h-14 items-center justify-center text-center sm:min-h-11">
          {asked ? (
            <p className="text-[14px] text-slate">
              Full reports come with every shortlist.{" "}
              <a href="#talk" className="link-chevron inline-block py-1.5 !text-[14px]">
                Book a call <span aria-hidden="true">›</span>
              </a>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAuto(false);
                setAsked(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-5 py-2.5 text-[14px] font-medium text-ink shadow-[0_1px_2px_rgb(10_12_15/0.06)] transition-colors duration-200 hover:border-ink/25"
            >
              View full report <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
