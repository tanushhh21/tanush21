"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/Logo";
import { prefersReducedMotion } from "./useOnceInView";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START = 9;
const HOURS = 8; // 09:00 to 17:00

// [day, start hour, length in hours]
type Slot = [number, number, number];
const BUSY: Slot[] = [
  [0, 9, 1.5],
  [0, 13, 1],
  [1, 9, 1],
  [1, 13, 2],
  [2, 10, 2],
  [2, 16, 1],
  [3, 13, 1],
  [3, 15, 2],
  [4, 9, 1],
  [4, 12, 2],
];
// Open slots found in your calendar, and who ends up in each (if anyone).
const OPEN: { at: Slot; who?: string; step?: number }[] = [
  { at: [0, 11, 1], who: "Rahul M.", step: 7 },
  { at: [1, 11, 1] },
  { at: [2, 15, 1], who: "Priya S.", step: 6 },
  { at: [3, 10, 1], who: "Ananya K.", step: 7 },
  { at: [4, 15, 1], who: "Kabir J.", step: 8 },
];

// When each step begins, in ms after the panel comes into view.
const STEPS = [0, 400, 2200, 3000, 4100, 5300, 6300, 7700, 9300];
const FINAL = STEPS.length - 1;

const STATUS = [
  "Calendar connected",
  "Checking your calendar",
  "5 open slots found",
  "Messaging candidates",
  "Messaging candidates",
  "Messaging candidates",
  "1 interview booked",
  "3 interviews booked",
  "4 interviews booked",
];

const box = ([d, h, len]: Slot) => ({
  left: `${d * 20}%`,
  width: "20%",
  top: `${((h - START) / HOURS) * 100}%`,
  height: `${(len / HOURS) * 100}%`,
});

const fade = (on: boolean) =>
  `transition-[opacity,transform] duration-500 ease-out-expo ${on ? "opacity-100 scale-100" : "opacity-0 scale-95"}`;

/**
 * Scheduling, shown as it happens: we read your calendar for open slots, agree
 * a time with each candidate, and chase anyone who goes quiet. Every element
 * is laid out from the start and only fades in, so nothing on the page moves.
 */
export default function Scheduling() {
  const ref = useRef<HTMLDivElement>(null);
  const msgs = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(FINAL);

  // The calendar part (reading the week, finding open slots) starts when the
  // card comes into view. The conversation waits until its own panel is on
  // screen too: on phones it sits below the calendar.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    setStep(0);
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let calendarDone = false;
    let msgsSeen = false;
    let talking = false;
    const talk = () => {
      if (talking || !calendarDone || !msgsSeen) return;
      talking = true;
      for (let i = 3; i < STEPS.length; i++) at(STEPS[i] - STEPS[3] + 300, () => setStep(i));
    };
    const card = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        card.disconnect();
        at(STEPS[1], () => setStep(1));
        at(STEPS[2], () => {
          setStep(2);
          calendarDone = true;
          talk();
        });
      },
      { threshold: 0.2 },
    );
    const panel = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        panel.disconnect();
        msgsSeen = true;
        talk();
      },
      { threshold: 0.3 },
    );
    card.observe(ref.current!);
    panel.observe(msgs.current!);
    return () => {
      card.disconnect();
      panel.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const done = step === FINAL;

  return (
    <div
      ref={ref}
      className="mx-auto mt-14 max-w-[60rem] overflow-hidden rounded-[24px] border border-hairline bg-paper text-left shadow-[0_1px_2px_rgb(10_12_15/0.06),0_24px_48px_-24px_rgb(10_12_15/0.18)]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Mark className="h-3.5 w-auto text-ink" />
          <span className="font-display text-[15px] font-semibold text-ink max-[379px]:hidden">Scheduling</span>
        </div>
        <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-slate" aria-hidden="true">
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-300 ${
              done ? "bg-ink" : step >= 1 ? "animate-pulse bg-signal" : "bg-hairline"
            }`}
          />
          {STATUS[step]}
        </span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" aria-hidden="true">
        {/* Your calendar */}
        <div className="border-b border-hairline p-4 sm:p-6 md:border-b-0 md:border-r">
          <p className="eyebrow !text-[15px]">Your calendar</p>
          <div className="mt-4 grid grid-cols-[2.5rem_minmax(0,1fr)]">
            <span />
            <div className="grid grid-cols-5 pb-2 text-center text-[12.5px] font-medium text-slate">
              {DAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="relative">
              {Array.from({ length: HOURS }, (_, i) => (
                <span
                  key={i}
                  className="absolute right-2 -translate-y-1/2 font-mono text-[10.5px] tabular-nums text-slate"
                  style={{ top: `${(i / HOURS) * 100}%` }}
                >
                  {String(START + i).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            <div className="relative h-[20rem] border-t border-hairline sm:h-[22rem]">
              {Array.from({ length: HOURS }, (_, i) => (
                <span key={i} className="absolute inset-x-0 border-b border-hairline" style={{ top: `${((i + 1) / HOURS) * 100}%` }} />
              ))}
              {DAYS.slice(1).map((d, i) => (
                <span key={d} className="absolute inset-y-0 border-l border-hairline/70" style={{ left: `${(i + 1) * 20}%` }} />
              ))}

              {BUSY.map((s) => (
                <span key={s.join()} className="absolute p-[3px]" style={box(s)}>
                  <span className="flex h-full items-start rounded-md bg-mist px-1.5 py-1 text-[10.5px] text-slate">Busy</span>
                </span>
              ))}

              {OPEN.map((o, i) => {
                const booked = o.step !== undefined && step >= o.step;
                return (
                  <span key={o.at.join()} className="absolute p-[3px]" style={box(o.at)}>
                    <span
                      className={`absolute inset-[3px] rounded-md border border-dashed border-signal/60 bg-signal/[0.05] ${fade(step >= 2 && !booked && !(o.who === undefined && step >= 6))}`}
                      style={{ transitionDelay: step === 2 ? `${i * 90}ms` : "0ms" }}
                    />
                    {o.who ? (
                      <span
                        className={`relative flex h-full flex-col justify-start overflow-hidden rounded-md bg-signal px-1.5 py-1 text-[10.5px] leading-tight text-paper ${fade(booked)}`}
                      >
                        <span className="truncate font-medium">{o.who}</span>
                        <span className="truncate opacity-75">Interview</span>
                      </span>
                    ) : null}
                  </span>
                );
              })}

              {/* The read across your week. */}
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-full transition-transform ease-linear"
                style={{
                  transform: `translateX(${step >= 1 ? 100 : 0}%)`,
                  transitionDuration: step >= 1 ? "1700ms" : "0ms",
                  opacity: step === 1 ? 1 : 0,
                }}
              >
                <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-signal shadow-[0_0_12px_2px_rgb(27_77_255/0.35)]" />
              </span>
            </div>
          </div>
        </div>

        {/* Messages with candidates */}
        <div ref={msgs} className="flex flex-col p-4 sm:p-6">
          <p className="eyebrow !text-[15px]">Messages with candidates</p>
          <div className="mt-4 grid gap-3 text-[14px] leading-snug">
            <p className={`text-[12.5px] text-slate ${fade(step >= 3)}`}>To Priya S. · SDE Intern</p>
            <p className={`ml-auto w-fit max-w-[90%] rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-paper ${fade(step >= 3)}`}>
              Hi Priya, Acme would like to interview you for the SDE Intern role. Would Tuesday at 11:00 or Wednesday at
              15:00 suit you for a 45-minute interview?
            </p>
            <div className="grid">
              <div
                className={`col-start-1 row-start-1 flex w-fit items-center gap-1 self-start rounded-[18px] rounded-bl-md bg-mist px-4 py-3.5 ${fade(step === 4)}`}
              >
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </div>
              <p className={`col-start-1 row-start-1 w-fit max-w-[90%] rounded-[18px] rounded-bl-md bg-mist px-4 py-2.5 text-ink ${fade(step >= 5)}`}>
                Wednesday at 3 works for me.
              </p>
            </div>
            <p className={`ml-auto w-fit max-w-[90%] rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-paper ${fade(step >= 6)}`}>
              Confirmed for Wednesday at 15:00. The invite is in your inbox, and we will remind you the day before.
            </p>
            <p className={`mt-2 flex items-center gap-2 text-[13px] text-slate ${fade(step >= 7)}`}>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.75V8l2.25 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Kabir J. has not replied in a day. Follow-up sent.
            </p>
            <p className={`flex items-center gap-2 text-[13px] text-ink ${fade(step >= 8)}`}>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Kabir J. confirmed Friday at 15:00.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
