"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "../Logo";
import { easeOut, prefersReducedMotion, useOnceInView } from "./useOnceInView";

/**
 * Hiring from one message. The request is typed, Winnow drafts the role,
 * one click approves it, and the work runs in the background until the
 * shortlist is ready. Plays once when it comes into view; can be replayed.
 */

const ASK = "I want to hire SDE interns for my org.";

// Timeline, in ms from the start.
const T = {
  type: 300,
  sent: 300 + ASK.length * 45 + 250,
  thinking: 0,
  reply: 0,
  card: 0,
  click: 0,
  approved: 0,
  tasks: 0,
  done: 0,
  end: 0,
};
T.thinking = T.sent + 350;
T.reply = T.thinking + 1000;
T.card = T.reply + 300;
T.click = T.card + 1900;
T.approved = T.click + 250;
T.tasks = T.approved + 300;
T.done = T.tasks + 6 * 900 + 600;
T.end = T.done + 400;

const BRIEF = [
  ["Role", "SDE Intern, Engineering"],
  ["Location", "Bengaluru, hybrid"],
  ["Duration", "6 months, from January"],
  ["Stipend", "₹40,000 a month"],
  ["Skills", "Data structures, Java or Python, Git"],
];
const CHANNELS = ["Naukri", "Internshala", "Unstop", "Careers page", "Campus"];

const TASKS = [
  { label: "Job posted", unit: "channels", n: 5, day: "Day 1" },
  { label: "Applications received", unit: "", n: 412, day: "Days 1–4" },
  { label: "Candidates sourced", unit: "", n: 96, day: "Days 1–4" },
  { label: "Profiles assessed", unit: "", n: 508, day: "Days 2–5" },
  { label: "Top candidates verified", unit: "", n: 30, day: "Day 5" },
  { label: "Interviews scheduled", unit: "", n: 12, day: "Day 6" },
];

const fmt = new Intl.NumberFormat("en-IN");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const shown = (t: number, at: number) => (t >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2");

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin text-slate" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${className}`} aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useOnceInView(ref, 0.35);
  const [t, setT] = useState(T.end); // server and no-JS: the finished state
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return setT(T.end);
    if (!seen) return setT(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = now - t0;
      setT(Math.min(el, T.end));
      if (el < T.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, run]);

  const typed = t >= T.sent ? "" : ASK.slice(0, Math.max(0, Math.floor((t - T.type) / 45)));
  const working = t >= T.approved && t < T.done;
  const taskAt = (i: number) => T.tasks + i * 900;

  return (
    <div ref={ref} className="mx-auto max-w-[64rem]">
      <div className="overflow-hidden rounded-[24px] border border-hairline bg-paper shadow-[0_1px_2px_rgb(10_12_15/0.06),0_24px_48px_-24px_rgb(10_12_15/0.18)]">
        {/* Window bar */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Mark className="h-3.5 w-auto text-ink" />
            <span className="font-display text-[15px] font-semibold text-ink">New role</span>
          </div>
          <span className="flex items-center gap-2 text-[13px] text-slate">
            <span className={`h-2 w-2 rounded-full ${working ? "animate-pulse bg-signal" : t >= T.done ? "bg-ink" : "bg-hairline"}`} />
            {working ? "Working in the background" : t >= T.done ? "Shortlist ready" : "Example"}
          </span>
        </div>

        <div className="grid md:h-[34rem] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Conversation */}
          <div className="flex min-h-[30rem] flex-col border-hairline md:min-h-0 md:border-r">
            <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
              <div className={`self-end rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-paper transition-all duration-300 ${shown(t, T.sent)}`}>
                {ASK}
              </div>

              {t >= T.thinking && t < T.reply ? (
                <div className="flex w-fit items-center gap-1 rounded-[18px] rounded-bl-md bg-mist px-4 py-3.5" aria-hidden="true">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </div>
              ) : null}

              <div className={`flex flex-col gap-3 transition-all duration-300 ${shown(t, T.reply)}`}>
                <p className="w-fit max-w-[90%] rounded-[18px] rounded-bl-md bg-mist px-4 py-2.5 text-[15px] text-ink">
                  Here is a draft of the role. Edit anything, or approve it to start.
                </p>
                <div className="rounded-[16px] border border-hairline p-4">
                  <dl className="grid gap-1.5 text-[14px]">
                    {BRIEF.map(([k, v], i) => (
                      <div key={k} className={`grid grid-cols-[5.5rem_minmax(0,1fr)] transition-all duration-300 ${shown(t, T.card + i * 140)}`}>
                        <dt className="text-slate">{k}</dt>
                        <dd className="text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className={`mt-3 flex flex-wrap gap-1.5 transition-all duration-300 ${shown(t, T.card + 5 * 140)}`}>
                    {CHANNELS.map((c) => (
                      <span key={c} className="rounded-full border border-hairline px-2.5 py-0.5 text-[12.5px] text-ink">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className={`relative mt-4 transition-all duration-300 ${shown(t, T.card + 6 * 140)}`}>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-all duration-200 ${
                        t >= T.approved ? "bg-mist text-ink" : "bg-signal text-paper"
                      } ${t >= T.click && t < T.approved ? "scale-95" : ""}`}
                    >
                      {t >= T.approved ? (
                        <>
                          <Check className="text-ink" /> Approved
                        </>
                      ) : (
                        "Approve and start"
                      )}
                    </span>
                    {/* The click */}
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="pointer-events-none absolute h-5 w-5 drop-shadow-sm transition-all duration-700 ease-out-expo"
                      style={{
                        left: t >= T.click - 700 ? "5.5rem" : "11rem",
                        top: t >= T.click - 700 ? "0.9rem" : "2.6rem",
                        opacity: t >= T.card + 6 * 140 && t < T.approved + 500 ? 1 : 0,
                      }}
                    >
                      <path d="M5 3l14 8-6 1.6L10 19z" fill="#0A0C0F" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <p className={`mt-auto w-fit max-w-[90%] rounded-[18px] rounded-bl-md bg-mist px-4 py-2.5 text-[15px] text-ink transition-all duration-300 ${shown(t, T.done)}`}>
                Your shortlist is ready: 12 candidates, with interviews booked for Thursday and Friday.
              </p>
            </div>

            {/* Composer */}
            <div className="border-t border-hairline p-3">
              <div className="flex items-center gap-3 rounded-full border border-hairline px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                  {typed || <span className="text-slate">Describe the role you want to fill</span>}
                  {t >= T.type && t < T.sent ? <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-ink" /> : null}
                </span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${typed ? "bg-signal" : "bg-hairline"}`} aria-hidden="true">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </div>
          </div>

          {/* Background work */}
          <div className="border-t border-hairline bg-mist/60 p-5 sm:p-6 md:border-t-0">
            <p className="eyebrow !text-[15px]">Running in the background</p>
            <ol className="mt-5 grid gap-3">
              {TASKS.map((task, i) => {
                const start = taskAt(i);
                const p = clamp01((t - start) / 850);
                const done = p >= 1;
                const active = t >= start && !done;
                return (
                  <li
                    key={task.label}
                    className="flex items-center gap-3 rounded-[14px] bg-paper px-4 py-3"
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {done ? <Check className="text-signal" /> : active ? <Spinner /> : <span className="h-2 w-2 rounded-full bg-hairline" />}
                    </span>
                    <span className={`min-w-0 flex-1 text-[14px] transition-colors duration-300 ${t >= start ? "text-ink" : "text-slate"}`}>
                      {task.label}
                    </span>
                    <span className={`font-mono text-[14px] tabular-nums ${t >= start ? "text-ink" : "text-slate"}`}>
                      {t >= start ? fmt.format(Math.round(easeOut(p) * task.n)) : "–"}
                      {task.unit ? <span className="text-slate"> {task.unit}</span> : null}
                    </span>
                    <span className="label hidden w-[4.6rem] text-right sm:inline">{task.day}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <p className="font-display text-[clamp(1.25rem,2vw,1.6rem)] font-semibold tracking-[-0.02em] text-ink">
          Your part: one message and one click.
        </p>
        <p className="body-lg max-w-[34rem]">
          Winnow does the routine work in the background: posting, screening, verification and scheduling.
        </p>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className={`link-chevron mt-1 transition-opacity duration-300 ${t >= T.end && seen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          Replay <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
