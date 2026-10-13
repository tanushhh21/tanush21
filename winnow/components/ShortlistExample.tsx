"use client";

import { m } from "motion/react";
import Reveal from "./Reveal";
import { EASE_OUT, VIEWPORT } from "./motion";

// Illustrative only: anonymised, invented candidates showing the format.
const ROWS = [
  {
    who: "Candidate A",
    meta: ["7 yrs", "Payments infrastructure", "Notice: 30 days"],
    why: "Led the ledger rewrite at a Series C fintech and owns reconciliation for four million transactions a day.",
    probe: "Has managed two engineers. Ask how they would grow a team of five.",
    status: "Interest confirmed",
  },
  {
    who: "Candidate B",
    meta: ["5 yrs", "Distributed systems", "Notice: 60 days, buyout possible"],
    why: "Maintains an open-source Go rate limiter that other companies run in production. Writes unusually clear design docs.",
    probe: "Mostly internal platform work so far, little customer-facing product.",
    status: "Interest confirmed",
  },
  {
    who: "Candidate C",
    meta: ["6 yrs", "Platform", "Notice: 15 days"],
    why: "Went from SDE-1 to tech lead in three years. Built on-call and incident review from scratch.",
    probe: "Expected CTC sits at the top of your band.",
    status: "First call booked",
  },
  {
    who: "Candidate D",
    meta: ["8 yrs", "Data infrastructure", "Serving notice"],
    why: "Moved a nightly batch pipeline to streaming with no downtime. Mentors a community study group.",
    probe: "Prefers hybrid. Confirm how many office days you need.",
    status: "Interest confirmed",
  },
];

export default function ShortlistExample() {
  return (
    <section id="shortlist" aria-labelledby="shortlist-heading" className="section-y bg-mist">
      <div className="wrap">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-end md:gap-16">
          <div>
            <p className="label">
              <Reveal>What you receive</Reveal>
            </p>
            <h2 id="shortlist-heading" className="display-lg mt-5 text-ink">
              <Reveal delay={0.06}>A shortlist you can act on.</Reveal>
            </h2>
          </div>
          <p className="body-lg">
            <Reveal delay={0.12}>
              Every name arrives with the evidence behind it and the questions worth asking, so you
              can decide who to meet in minutes.
            </Reveal>
          </p>
        </div>

        <m.div
          className="mt-14 overflow-hidden rounded-[20px] border border-hairline bg-paper shadow-lift"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline px-5 py-4 sm:px-8">
            <p className="text-[15px] font-medium text-ink">
              Senior Backend Engineer <span className="text-slate">· Bengaluru</span>
            </p>
            <p className="label">
              <span className="tabular-nums text-ink">10</span> of{" "}
              <span className="tabular-nums text-ink">2,140</span> · Illustrative example
            </p>
          </div>
          <ol>
            {ROWS.map((r, i) => (
              <m.li
                key={r.who}
                className="grid gap-4 border-b border-hairline px-5 py-6 sm:px-8 md:grid-cols-[4.5rem_minmax(0,15rem)_minmax(0,1fr)_auto] md:gap-8"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 + i * 0.06 }}
              >
                <div className="flex items-center gap-3 md:items-start md:pt-0.5">
                  <span aria-hidden="true" className="mt-px h-2.5 w-2.5 rounded-full bg-signal" />
                  <span className="label tabular-nums text-ink">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <p className="text-[16px] font-medium text-ink">{r.who}</p>
                  <p className="mt-1.5 text-[14px] leading-snug text-slate">{r.meta.join(" · ")}</p>
                </div>
                <dl className="grid gap-3 text-[15px] leading-relaxed">
                  <div className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="label pt-[3px]">Why</dt>
                    <dd className="text-ink">{r.why}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="label pt-[3px]">Probe</dt>
                    <dd className="text-slate">{r.probe}</dd>
                  </div>
                </dl>
                <p className="self-start justify-self-start whitespace-nowrap rounded-full border border-hairline px-3 py-1 text-[13px] text-ink md:justify-self-end">
                  {r.status}
                </p>
              </m.li>
            ))}
          </ol>
          <p className="px-5 py-5 text-[15px] text-slate sm:px-8">
            <span className="label mr-3 tabular-nums text-ink">05–10</span>
            Six more, each with reasons and risks.
          </p>
        </m.div>
      </div>
    </section>
  );
}
