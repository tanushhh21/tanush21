"use client";

import { useEffect, useRef } from "react";
import { easeOut, prefersReducedMotion, useOnceInView } from "./useOnceInView";

const ROWS = [
  { id: "a", name: "Candidate A", source: "Sourced", score: 92, why: "Built payment infrastructure at scale.", met: ["Go", "Postgres", "On-call"], miss: [] as string[] },
  { id: "b", name: "Candidate B", source: "Inbound", score: 88, why: "Deep experience with distributed systems.", met: ["Go", "Kafka"], miss: ["On-call"] },
  { id: "c", name: "Candidate C", source: "Inbound", score: 81, why: "Promoted to tech lead within three years.", met: ["Postgres", "On-call"], miss: ["Go"] },
];
// Where each row sits before ranking: the order they arrived in.
const ARRIVAL = [2, 0, 1];

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "signal" | "muted" }) {
  const tones = {
    plain: "border-hairline text-ink",
    signal: "border-signal/30 bg-signal/[0.06] text-signal",
    muted: "border-hairline text-slate line-through decoration-slate/60",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] ${tones[tone]}`}>{children}</span>;
}

/**
 * The example list ranks itself: rows arrive in application order, then move
 * into rank order while their scores count up and verification lands.
 */
export default function RankedList() {
  const wrap = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const scores = useRef<(HTMLSpanElement | null)[]>([]);
  const run = useOnceInView(wrap, 0.35);

  // Shortly before it scrolls into view, put each row where it arrived. Done
  // late rather than on load, so measuring never lands in hydration.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = wrap.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || el.dataset.ranked === "false" || el.dataset.done) return;
        io.disconnect();
        const els = rows.current;
        const tops = els.map((r) => r!.offsetTop);
        els.forEach((r, i) => {
          r!.style.transform = `translateY(${tops[ARRIVAL[i]] - tops[i]}px)`;
        });
        scores.current.forEach((s) => (s!.textContent = "–"));
        el.dataset.ranked = "false";
      },
      { rootMargin: "0px 0px 60% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      wrap.current!.dataset.ranked = "true";
      wrap.current!.dataset.done = "true";
      rows.current.forEach((el, i) => {
        el!.style.transition = `transform 900ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms`;
        el!.style.transform = "translateY(0)";
      });
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / 1100);
        scores.current.forEach((s, i) => (s!.textContent = String(Math.round(easeOut(t) * ROWS[i].score))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, 450);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <div ref={wrap} data-ranked="true" className="ranked mx-auto mt-14 max-w-[56rem] overflow-hidden rounded-[22px] border border-hairline bg-paper shadow-lift">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4 sm:px-7">
        <p className="text-[15px] font-medium text-ink">Backend Engineer</p>
        <p className="eyebrow !text-[14px]">Example</p>
      </div>
      <ol className="relative">
        {ROWS.map((r, i) => (
          <li
            key={r.name}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className="relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-hairline bg-paper px-5 py-5 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-6 sm:px-7"
          >
            <span className="label pt-1.5 tabular-nums text-ink sm:pt-0">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15.5px] font-medium text-ink">{r.name}</p>
                <Pill>{r.source}</Pill>
                <span className="ranked-verify" style={{ transitionDelay: `${700 + i * 120}ms` }}>
                  <Pill tone="signal">Verified</Pill>
                </span>
              </div>
              <p className="mt-1.5 text-[14.5px] text-slate">{r.why}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {r.met.map((m) => (
                  <Pill key={m}>{m}</Pill>
                ))}
                {r.miss.map((m) => (
                  <Pill key={m} tone="muted">
                    {m}
                  </Pill>
                ))}
              </div>
              {/* Opens this candidate's report in the section below (see Analysis). */}
              <a
                href={`#report-${r.id}`}
                onClick={() => window.dispatchEvent(new CustomEvent("open-report", { detail: r.id }))}
                className="link-chevron mt-1.5 -mb-1.5 inline-block py-1.5 !text-[14px]"
              >
                See detailed report <span aria-hidden="true">›</span>
              </a>
            </div>
            <p className="min-w-[2ch] text-right font-mono text-[1.5rem] font-medium leading-none tabular-nums tracking-[-0.04em] text-ink sm:text-[1.75rem]">
              <span
                ref={(el) => {
                  scores.current[i] = el;
                }}
              >
                {r.score}
              </span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
