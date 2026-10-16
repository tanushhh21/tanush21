"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "../Logo";
import { easeOut, prefersReducedMotion } from "./useOnceInView";

/**
 * Hiring from one conversation. The request is typed, Winnow asks for the
 * job description, the JD is uploaded, one click approves the plan, and every
 * step after that arrives as an update in the same chat. Loops while visible.
 */

const ASK = "I want to hire SDE interns for my org.";
const ADD = "Here is the JD. We need 5 interns in Bengaluru.";
const FILE = "SDE-Intern-JD.pdf";

// Timeline, in ms from the start of a loop.
const T = {
  type1: 400,
  send1: 400 + ASK.length * 42 + 200,
  dots1: 0,
  ask: 0,
  attach: 0,
  type2: 0,
  send2: 0,
  dots2: 0,
  plan: 0,
  click: 0,
  approved: 0,
  updates: 0,
  done: 0,
  end: 0,
  loop: 0,
};
T.dots1 = T.send1 + 350;
T.ask = T.dots1 + 950;
T.attach = T.ask + 900;
T.type2 = T.attach + 1000;
T.send2 = T.type2 + ADD.length * 34 + 200;
T.dots2 = T.send2 + 350;
T.plan = T.dots2 + 950;
T.click = T.plan + 1500;
T.approved = T.click + 220;
T.updates = T.approved + 450;

type Update = { text: string; done?: string; day: string; count?: number; spin: number; signal?: boolean };
const UPDATES: Update[] = [
  { text: "Posting on LinkedIn", done: "Posted on LinkedIn", day: "Day 1", spin: 500 },
  { text: "Posting on Naukri", done: "Posted on Naukri", day: "Day 1", spin: 500 },
  { text: "Posting on Internshala and Unstop", done: "Posted on Internshala and Unstop", day: "Day 1", spin: 500 },
  { text: "Sharing with campus placement cells", done: "Shared with 3 campus placement cells", day: "Day 1", spin: 600 },
  { text: "Searching talent databases", done: "Found 84 strong candidates who had not applied", day: "Days 1–4", spin: 1300 },
  { text: "Applications received", day: "Days 1–4", count: 312, spin: 1300 },
  { text: "Screening every profile against the JD", done: "Every profile screened against the JD", day: "Day 5", spin: 900 },
  { text: "Verifying top candidates", done: "Top 30 candidates verified", day: "Day 5", spin: 700 },
  { text: "Scheduling interviews", done: "Interviews scheduled with 12 candidates", day: "Day 6", spin: 800, signal: true },
];
const updateAt: number[] = [];
{
  let at = T.updates;
  for (const u of UPDATES) {
    updateAt.push(at);
    at += u.spin + 250;
  }
  T.done = at + 250;
  T.end = T.done + 600;
  T.loop = T.end + 4200; // hold the finished chat, then start again
}

const fmt = new Intl.NumberFormat("en-IN");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
    <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 ${className}`} aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileChip({ progress }: { progress: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-[12px] border border-hairline bg-paper px-3 py-2 text-left">
      <svg viewBox="0 0 20 24" className="h-6 w-5 shrink-0" aria-hidden="true">
        <path d="M2 1.5h11l5 5v16H2z" fill="#F6F7F8" stroke="#0A0C0F" strokeOpacity="0.35" />
        <path d="M13 1.5v5h5" fill="none" stroke="#0A0C0F" strokeOpacity="0.35" />
        <rect x="4.5" y="14" width="11" height="5" rx="1" fill="#1B4DFF" />
      </svg>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-ink">{FILE}</span>
        <span className="mt-1 block h-1 w-28 overflow-hidden rounded-full bg-hairline">
          <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      </span>
    </span>
  );
}

/** One-line chip for the composer, so its height never changes. */
function MiniFile({ progress }: { progress: number }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-paper py-1 pl-2 pr-3 text-[13px] text-ink">
      <svg viewBox="0 0 20 24" className="h-4 w-3.5 shrink-0" aria-hidden="true">
        <path d="M2 1.5h11l5 5v16H2z" fill="#F6F7F8" stroke="#0A0C0F" strokeOpacity="0.35" />
        <rect x="4.5" y="14" width="11" height="5" rx="1" fill="#1B4DFF" />
      </svg>
      <span className="truncate">{FILE}</span>
      <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-hairline">
        <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
    </span>
  );
}

function Dots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-[18px] rounded-bl-md bg-mist px-4 py-3.5" aria-hidden="true">
      {[0, 1, 2].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate" style={{ animationDelay: `${d * 120}ms` }} />
      ))}
    </div>
  );
}

export default function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [fade, setFade] = useState(false);
  // Bottom edge of each message in the stack, and the visible height. The
  // whole conversation is laid out once; showing a message only slides the
  // stack up (a transform), so nothing on the page shifts.
  const [geo, setGeo] = useState<{ bottoms: number[]; view: number } | null>(null);

  useEffect(() => {
    const view = viewRef.current!;
    const stack = stackRef.current!;
    const measure = () => {
      const items = Array.from(stack.children) as HTMLElement[];
      setGeo({ bottoms: items.map((el) => el.offsetTop + el.offsetHeight), view: view.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stack);
    ro.observe(view);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return setT(T.end);
    const el = ref.current!;
    let raf = 0;
    let visible = false;
    let base = performance.now();
    let pausedAt = 0;
    let started = false;
    const tick = (now: number) => {
      const el2 = now - base;
      if (el2 >= T.loop) {
        base = now;
        setFade(false);
        setT(0);
      } else {
        setFade(el2 > T.loop - 450);
        setT(Math.min(el2, T.end));
      }
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) {
          // First view starts from the top; later views resume where they paused.
          base = started ? performance.now() - pausedAt : performance.now();
          started = true;
          raf = requestAnimationFrame(tick);
        } else if (!visible && raf) {
          pausedAt = performance.now() - base;
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const typing1 = t >= T.type1 && t < T.send1;
  const typing2 = t >= T.type2 && t < T.send2;
  const composerText = typing1
    ? ASK.slice(0, Math.floor((t - T.type1) / 42))
    : typing2
      ? ADD.slice(0, Math.floor((t - T.type2) / 34))
      : "";
  const attaching = t >= T.attach && t < T.send2;
  const upload = clamp01((t - T.attach) / 800);
  const status = t >= T.done ? "Shortlist ready" : t >= T.approved ? "Working in the background" : "Example";

  const thinking = (t >= T.dots1 && t < T.ask) || (t >= T.dots2 && t < T.plan);

  const items: { at: number; node: React.ReactNode }[] = [
    {
      at: T.send1,
      node: <p className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-paper">{ASK}</p>,
    },
    {
      at: T.ask,
      node: (
        <p className="w-fit max-w-[85%] rounded-[18px] rounded-bl-md bg-mist px-4 py-2.5 text-[15px] text-ink">
          Happy to help. Could you share the job description, and tell me how many interns you need and where?
        </p>
      ),
    },
    {
      at: T.send2,
      node: (
        <div className="ml-auto flex w-fit max-w-[85%] flex-col items-end gap-2">
          <FileChip progress={1} />
          <p className="rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-paper">{ADD}</p>
        </div>
      ),
    },
    {
      at: T.plan,
      node: (
        <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-mist p-4">
          <p className="text-[15px] text-ink">Thanks. I have read the JD. Here is the plan:</p>
          <div className="mt-3 rounded-[14px] bg-paper p-3.5 text-[14px] leading-relaxed text-ink">
            <p className="font-medium">SDE Intern · 5 openings · Bengaluru</p>
            <p className="text-slate">
              Post on LinkedIn, Naukri, Internshala, Unstop and campus portals. Source from talent databases. Screen, verify
              and book interviews.
            </p>
          </div>
          <div className="relative mt-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-all duration-200 ${
                t >= T.approved ? "bg-paper text-ink" : "bg-signal text-paper"
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
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="pointer-events-none absolute h-5 w-5 transition-all duration-700 ease-out-expo"
              style={{
                left: t >= T.click - 750 ? "5.5rem" : "12rem",
                top: t >= T.click - 750 ? "0.95rem" : "2.8rem",
                opacity: t >= T.plan + 300 && t < T.approved + 450 ? 1 : 0,
              }}
            >
              <path d="M5 3l14 8-6 1.6L10 19z" fill="#0A0C0F" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      ),
    },
    ...UPDATES.map((u, i) => {
      const at = updateAt[i];
      const p = clamp01((t - at) / u.spin);
      const finished = p >= 1;
      const label =
        u.count !== undefined ? (
          <>
            {u.text}: <span className="font-mono tabular-nums">{fmt.format(Math.round(easeOut(p) * u.count))}</span>
          </>
        ) : finished && u.done ? (
          u.done
        ) : (
          u.text
        );
      return {
        at,
        node: (
          <div className="flex items-center gap-3 rounded-[14px] border border-hairline px-3.5 py-2.5">
            <span className="flex h-4 w-4 items-center justify-center">
              {finished ? <Check className={u.signal ? "text-signal" : "text-ink"} /> : <Spinner />}
            </span>
            {/* Both wordings share one cell, so the row is always as tall as the longer one. */}
            <span className="grid min-w-0 flex-1 text-[14px] text-ink">
              <span className="[grid-area:1/1]">{label}</span>
              <span className="invisible [grid-area:1/1]">{u.done ?? u.text}</span>
            </span>
            <span className="label hidden whitespace-nowrap sm:inline">{u.day}</span>
          </div>
        ),
      };
    }),
    {
      at: T.done,
      node: (
        <div className="w-fit max-w-[88%] rounded-[18px] rounded-bl-md bg-mist px-4 py-3">
          <p className="text-[15px] text-ink">Your shortlist is ready: 12 candidates, with interviews on Thursday and Friday.</p>
          <span className="mt-2.5 inline-flex rounded-full bg-ink px-3.5 py-1.5 text-[13.5px] font-medium text-paper">View shortlist</span>
        </div>
      ),
    },
  ];

  // Slide the stack so the newest visible message (and the typing dots,
  // when Winnow is replying) sits just above the bottom edge.
  let offset = 0;
  if (geo) {
    let last = -1;
    items.forEach((it, i) => {
      if (t >= it.at) last = i;
    });
    const bottom = (last >= 0 ? geo.bottoms[last] : 0) + (thinking ? 56 : 0) + 20;
    offset = geo.view - bottom;
  }

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-[24px] border border-hairline bg-paper shadow-[0_1px_2px_rgb(10_12_15/0.06),0_24px_48px_-24px_rgb(10_12_15/0.18)]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Mark className="h-3.5 w-auto text-ink" />
          <span className="font-display text-[15px] font-semibold text-ink max-[379px]:hidden">Winnow</span>
        </div>
        <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-slate">
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-300 ${
              status === "Working in the background" ? "animate-pulse bg-signal" : status === "Shortlist ready" ? "bg-ink" : "bg-hairline"
            }`}
          />
          {status}
        </span>
      </div>

      {/* Every message is laid out from the start; each one fades in as it
          arrives while the stack slides up to keep the newest in view. */}
      <div
        ref={viewRef}
        className="relative h-[min(30rem,calc(100svh-9rem))] overflow-hidden transition-opacity duration-500 sm:h-[min(32rem,calc(100svh-9rem))]"
        style={{ opacity: fade ? 0 : 1 }}
        aria-hidden="true"
      >
        <div
          ref={stackRef}
          className="absolute inset-x-0 top-0 px-5 transition-transform duration-500 ease-out-expo sm:px-6"
          style={{ transform: `translateY(${offset}px)` }}
        >
          {items.map((it, i) => (
            <div key={i} className="pt-3 transition-opacity duration-500" style={{ opacity: t >= it.at ? 1 : 0 }}>
              {it.node}
            </div>
          ))}
        </div>
        <div
          className="absolute bottom-5 left-5 transition-opacity duration-300 sm:left-6"
          style={{ opacity: thinking ? 1 : 0 }}
        >
          <Dots />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-hairline p-3" aria-hidden="true">
        <div className="flex h-12 items-center gap-3 rounded-full border border-hairline pl-4 pr-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-ink">
            {attaching ? <MiniFile progress={upload} /> : null}
            {attaching && !typing2 ? null : (
              <span className="min-w-0 truncate">
                {composerText || <span className="text-slate">Describe the role, or upload a JD</span>}
                {typing1 || typing2 ? <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-ink" /> : null}
              </span>
            )}
          </span>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${composerText ? "bg-signal" : "bg-hairline"}`}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </div>
    </div>
  );
}
