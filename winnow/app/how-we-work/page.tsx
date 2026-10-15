import type { Metadata } from "next";
import { Suspense } from "react";
import PageHead from "@/components/PageHead";
import BlindTest from "@/components/BlindTest";
import Reveal from "@/components/Reveal";
import StagesStory from "@/components/how/StagesStory";
import VolumeScarce from "@/components/how/VolumeScarce";
import RankedList from "@/components/how/RankedList";

export const metadata: Metadata = {
  title: "How we work",
  description: "You give us a role. We hand back people worth meeting, with the interviews already booked.",
};

const NEEDS = [
  { title: "The brief", line: "One conversation, or an existing JD." },
  { title: "Your ATS", line: "We read from it and write back. Nothing replaced." },
  { title: "Your history", line: "Past roles and hires, so we learn your standard." },
  { title: "Corrections", line: "When a shortlist is wrong, tell us. That is the loop." },
];

export default function HowWeWork() {
  return (
    <main>
      <PageHead
        label="How we work"
        title="You give us a role. We hand back people worth meeting."
        sub="With the interviews already booked."
      />

      {/* Separate boundaries let React hydrate each animated part in its own task. */}
      <Suspense>
        <StagesStory />
      </Suspense>

      <section aria-labelledby="both-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="both-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Inbound and outbound. Every role.</Reveal>
          </h2>
          <Suspense>
            <VolumeScarce />
          </Suspense>
          <p className="mt-10 text-center text-[1.25rem] font-medium tracking-[-0.015em] text-ink">
            <Reveal>One brief. One shortlist. Either way.</Reveal>
          </p>
        </div>
      </section>

      <section aria-labelledby="see-heading" className="section-y">
        <div className="wrap">
          <h2 id="see-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Every candidate, one ranked list.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[30rem] text-center">
            <Reveal delay={0.06}>Disagree with any of it, and the system adjusts.</Reveal>
          </p>
          <Suspense>
            <RankedList />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="need-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="need-heading" className="display-lg text-center text-ink">
            <Reveal>What we need from you.</Reveal>
          </h2>
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NEEDS.map((n, i) => (
              <li
                key={n.title}
                data-reveal=""
                className="rise rounded-[22px] bg-paper p-7"
                style={{ "--reveal-delay": `${i * 0.08}s` } as React.CSSProperties}
              >
                <p className="label tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-6 text-[1.25rem] font-medium tracking-[-0.02em] text-ink">{n.title}</p>
                <p className="mt-2 text-[15px] leading-snug text-slate">{n.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <BlindTest tone="paper" />
    </main>
  );
}
