"use client";

import { m } from "motion/react";
import Reveal from "./Reveal";
import { EASE_OUT, VIEWPORT } from "./motion";

const STAGES = [
  {
    when: "Day 0",
    title: "Brief",
    body: "A 30-minute call on the role, the bar and the dealbreakers. We write the rubric; you sign it off.",
  },
  {
    when: "Days 1–5",
    title: "Search",
    body: "We source and read in full. You watch the pipeline grow in a shared channel and can steer at any point.",
  },
  {
    when: "Day 7",
    title: "Shortlist",
    body: "Ten names with reasons and risks. Every one has already said they want to talk.",
  },
  {
    when: "Then",
    title: "You decide",
    body: "You interview and make the offer. We keep the pipeline warm until someone signs.",
  },
];

export default function Process() {
  return (
    <section id="process" aria-labelledby="process-heading" className="section-y bg-paper">
      <div className="wrap">
        <p className="label">
          <Reveal>Working together</Reveal>
        </p>
        <h2 id="process-heading" className="display-lg mt-5 max-w-[18ch] text-ink">
          <Reveal delay={0.06}>From brief to first interview in a week.</Reveal>
        </h2>

        <m.ol
          className="relative mt-16 grid gap-10 md:mt-20 md:grid-cols-4 md:gap-8"
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
        >
          {/* The track: a hairline that draws across (down, on phones) as the section enters. */}
          <span aria-hidden="true" className="absolute left-[5px] top-2 bottom-2 w-px bg-hairline md:left-0 md:right-0 md:top-[5px] md:bottom-auto md:h-px md:w-auto" />
          <m.span
            aria-hidden="true"
            className="absolute left-[5px] top-2 bottom-2 w-px origin-top bg-ink md:left-0 md:right-0 md:top-[5px] md:bottom-auto md:h-px md:w-auto md:origin-left"
            variants={{ hidden: { scaleX: 0, scaleY: 0 }, show: { scaleX: 1, scaleY: 1 } }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.1 }}
          />
          {STAGES.map((s, i) => (
            <m.li
              key={s.title}
              className="relative pl-8 md:pl-0 md:pt-10"
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.2 + i * 0.12 }}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-[3px] h-[11px] w-[11px] rounded-full border border-ink bg-paper md:top-0"
              />
              <p className="label tabular-nums">{s.when}</p>
              <h3 className="mt-3 text-[1.375rem] font-medium tracking-[-0.02em] text-ink">{s.title}</h3>
              <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-slate">{s.body}</p>
            </m.li>
          ))}
        </m.ol>
      </div>
    </section>
  );
}
