import type { Metadata } from "next";
import { Suspense } from "react";
import PageHead from "@/components/PageHead";
import BlindTest from "@/components/BlindTest";
import Reveal from "@/components/Reveal";
import StagesStory from "@/components/how/StagesStory";
import VolumeScarce from "@/components/how/VolumeScarce";
import RankedList from "@/components/how/RankedList";
import ChatDemo from "@/components/how/ChatDemo";
import HiddenSignals from "@/components/how/HiddenSignals";

export const metadata: Metadata = {
  title: "How we work",
  description: "You give us a role. We hand back people worth meeting, with the interviews already booked.",
};

const NEEDS = [
  { title: "The role", line: "A short call, or your existing job description." },
  { title: "ATS access", line: "We sync with your current system. Nothing is replaced." },
  { title: "Hiring history", line: "Past roles and hires, so we learn your hiring standard." },
  { title: "Your feedback", line: "Tell us when a ranking is wrong. Every shortlist after improves." },
];

export default function HowWeWork() {
  return (
    <main>
      <PageHead
        label="How we work"
        title="You share a role. We deliver a shortlist worth interviewing."
        sub="With interviews already scheduled."
      />

      <section aria-label="Example" className="pt-14 pb-[clamp(5rem,12vh,9rem)] sm:pt-16">
        <div className="wrap">
          <Suspense>
            <ChatDemo />
          </Suspense>
        </div>
      </section>

      {/* Separate boundaries let React hydrate each animated part in its own task. */}
      <Suspense>
        <StagesStory />
      </Suspense>

      <section aria-labelledby="both-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="both-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Applicants and sourced candidates, on every role.</Reveal>
          </h2>
          <Suspense>
            <VolumeScarce />
          </Suspense>
          <p className="mt-10 text-center text-[1.25rem] font-medium tracking-[-0.015em] text-ink">
            <Reveal>Either way, you receive one shortlist.</Reveal>
          </p>
        </div>
      </section>

      <HiddenSignals />

      <section aria-labelledby="see-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="see-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Every candidate in one ranked list.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[30rem] text-center">
            <Reveal delay={0.06}>Override any ranking, and your feedback improves the next shortlist.</Reveal>
          </p>
          <Suspense>
            <RankedList />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="need-heading" className="section-y">
        <div className="wrap">
          <h2 id="need-heading" className="display-lg text-center text-ink">
            <Reveal>What we need from you.</Reveal>
          </h2>
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NEEDS.map((n, i) => (
              <li
                key={n.title}
                data-reveal=""
                className="rise rounded-[22px] bg-mist p-7"
                style={{ "--reveal-delay": `${i * 0.08}s` } as React.CSSProperties}
              >
                <p className="label tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-6 font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">{n.title}</p>
                <p className="mt-2 text-[15px] leading-snug text-slate">{n.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <BlindTest />
    </main>
  );
}
