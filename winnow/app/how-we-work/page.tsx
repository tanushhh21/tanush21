import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { Suspense } from "react";
import PageHead from "@/components/PageHead";
import Contact from "@/components/Contact";
import Reveal from "@/components/Reveal";
import StagesStory from "@/components/how/StagesStory";
import BeyondApplicants from "@/components/how/BeyondApplicants";
import RankedList from "@/components/how/RankedList";
import ChatDemo from "@/components/how/ChatDemo";
import HiddenSignals from "@/components/how/HiddenSignals";
import Analysis from "@/components/how/Analysis";
import Scheduling from "@/components/how/Scheduling";

export const metadata: Metadata = {
  title: "How we work",
  ...pageMeta("/how-we-work", "How we work · Winnow", "You give us a role. We hand back people worth meeting, with the interviews already booked."),
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

      <section aria-labelledby="demo-heading" className="pt-14 pb-[clamp(5rem,12vh,9rem)] sm:pt-20">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
          <div className="max-w-[30rem]">
            <h2 id="demo-heading" className="display-lg text-ink">
              <Reveal>Start with one message.</Reveal>
            </h2>
            <p className="body-lg mt-5">
              <Reveal delay={0.06}>
                Describe the role or share a job description. Winnow posts it, finds candidates, screens and verifies
                them, and books interviews, with every update in the same chat.
              </Reveal>
            </p>
            <p className="mt-6 font-display text-[clamp(1.25rem,1.8vw,1.5rem)] font-semibold tracking-[-0.02em] text-ink">
              <Reveal delay={0.12}>Your part: one message and one click.</Reveal>
            </p>
            <p className="sr-only">
              Example conversation: a hiring manager asks to hire SDE interns and uploads a job description. Winnow
              proposes a plan, which is approved with one click. Winnow then posts the role on LinkedIn, Naukri,
              Internshala and Unstop, shares it with campus placement cells, finds candidates who had not applied,
              screens and verifies them, and schedules interviews with twelve candidates.
            </p>
          </div>
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
          <div className="mx-auto max-w-[44rem] text-center">
            <h2 id="both-heading" className="display-lg text-ink">
              <Reveal>Most suitable candidates never apply.</Reveal>
            </h2>
            <p className="body-lg mx-auto mt-5 max-w-[34rem]">
              <Reveal delay={0.06}>
                Don&rsquo;t worry, we&rsquo;ve got you covered. We search well beyond your applicants, assess everyone
                against the same bar, and bring the right people to you.
              </Reveal>
            </p>
          </div>
          <Suspense>
            <BeyondApplicants />
          </Suspense>
          <p className="mt-10 text-center font-display text-[1.25rem] font-semibold tracking-[-0.015em] text-ink">
            <Reveal>Applied or not, the right people reach your shortlist.</Reveal>
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

      <section aria-labelledby="why-heading" className="section-y">
        <div className="wrap">
          <h2 id="why-heading" className="display-lg mx-auto max-w-[20ch] text-center text-ink">
            <Reveal>See the reasoning behind every choice.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[34rem] text-center">
            <Reveal delay={0.06}>
              Each candidate comes with a full analysis: how they measure against every requirement, the evidence
              behind the score, and why they rank where they do.
            </Reveal>
          </p>
          <Suspense>
            <Analysis />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="sched-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="sched-heading" className="display-lg mx-auto max-w-[20ch] text-center text-ink">
            <Reveal>Interviews, booked around your calendar.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[34rem] text-center">
            <Reveal delay={0.06}>
              We check your availability, agree a time with each candidate, send the invites and follow up with anyone
              who goes quiet.
            </Reveal>
          </p>
          <p className="sr-only">
            Example: Winnow reads your calendar and finds five open slots. It offers Priya two of them, she picks
            Wednesday at 15:00, and the interview is confirmed with an invite and a reminder. Two more interviews are
            booked, and when Kabir does not reply for a day, Winnow follows up until he confirms Friday at 15:00.
          </p>
          <Suspense>
            <Scheduling />
          </Suspense>
          <p className="mt-10 text-center font-display text-[1.25rem] font-semibold tracking-[-0.015em] text-ink">
            <Reveal>All you do is show up for the interview.</Reveal>
          </p>
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

      <Contact />
    </main>
  );
}
