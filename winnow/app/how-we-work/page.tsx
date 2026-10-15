import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import BlindTest from "@/components/BlindTest";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "How we work",
  description: "You give us a role. We hand back people worth meeting, with the interviews already booked.",
};

const STAGES = [
  { title: "Brief", line: "Tell us the role. We write the JD, or work from yours." },
  { title: "Distribute", line: "Posted to Naukri, your careers page and campus platforms." },
  { title: "Source", line: "In parallel, we find the people who did not apply." },
  { title: "Evaluate", line: "Every profile read against your requirement, not keywords." },
  { title: "Verify", line: "Identity and credentials checked before any interview." },
  { title: "Shortlist", line: "A ranked list, with the reasoning behind every name." },
  { title: "Schedule", line: "Interviews booked. Anyone who goes quiet, chased." },
];

const ROWS = [
  { name: "Candidate A", source: "Sourced", score: 92, why: "Shipped payments infra at scale.", met: ["Go", "Postgres", "On-call"], miss: [] },
  { name: "Candidate B", source: "Inbound", score: 88, why: "Strong systems depth, clear writing.", met: ["Go", "Kafka"], miss: ["On-call"] },
  { name: "Candidate C", source: "Inbound", score: 81, why: "Fast growth to tech lead.", met: ["Postgres", "On-call"], miss: ["Go"] },
];

const NEEDS = [
  { title: "The brief", line: "One conversation, or an existing JD." },
  { title: "Your ATS", line: "We read from it and write back. Nothing replaced." },
  { title: "Your history", line: "Past roles and hires, so we learn your standard." },
  { title: "Corrections", line: "When a shortlist is wrong, tell us. That is the loop." },
];

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "signal" | "muted" }) {
  const tones = {
    plain: "border-hairline text-ink",
    signal: "border-signal/30 bg-signal/[0.06] text-signal",
    muted: "border-hairline text-slate line-through decoration-slate/60",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] ${tones[tone]}`}>{children}</span>;
}

export default function HowWeWork() {
  return (
    <main>
      <PageHead
        label="How we work"
        title="You give us a role. We hand back people worth meeting."
        sub="With the interviews already booked."
      />

      {/* The seven stages, then the hand-off. */}
      <section aria-label="Stages" className="section-y">
        <ol className="wrap max-w-[56rem] border-t border-hairline">
          {STAGES.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-hairline py-6 sm:grid-cols-[4rem_14rem_minmax(0,1fr)] sm:py-7">
              <span className="label tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="text-[1.5rem] font-medium tracking-[-0.02em] text-ink sm:text-[1.75rem]">
                <Reveal>{s.title}</Reveal>
              </h2>
              <p className="col-start-2 mt-1 text-[16px] text-slate sm:col-start-3 sm:mt-0">
                <Reveal delay={0.06}>{s.line}</Reveal>
              </p>
            </li>
          ))}
          <li className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-4 py-8 sm:grid-cols-[4rem_14rem_minmax(0,1fr)]">
            <span aria-hidden="true" className="h-2.5 w-2.5 translate-y-[-2px] rounded-full bg-signal" />
            <p className="text-[1.5rem] font-medium tracking-[-0.02em] text-signal sm:text-[1.75rem]">
              <Reveal>Then it&rsquo;s yours.</Reveal>
            </p>
            <p className="col-start-2 mt-1 text-[16px] text-ink sm:col-start-3 sm:mt-0">
              <Reveal delay={0.06}>You interview. You make the offer.</Reveal>
            </p>
          </li>
        </ol>
      </section>

      {/* Inbound and outbound, on every role. */}
      <section aria-labelledby="both-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="both-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Inbound and outbound. Every role.</Reveal>
          </h2>
          <div className="mt-14 grid gap-4 md:grid-cols-2 md:gap-5">
            {[
              { n: "2,000", k: "Volume role", line: "applications for a support role in Bengaluru.", act: "We read every one." },
              { n: "9", k: "Scarce role", line: "applications for a battery storage engineer.", act: "So we go and find the rest." },
            ].map((t) => (
              <div key={t.k} className="rounded-[28px] bg-paper p-8 sm:p-10">
                <span className="label">{t.k}</span>
                <p className="mt-10 font-mono text-[clamp(3rem,7vw,5.5rem)] font-medium leading-none tracking-[-0.08em] tabular-nums text-ink">
                  {t.n}
                </p>
                <p className="mt-4 max-w-[22rem] text-[1.125rem] leading-snug text-slate">{t.line}</p>
                <p className="mt-2 text-[1.125rem] font-medium leading-snug text-ink">{t.act}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-[1.25rem] font-medium tracking-[-0.015em] text-ink">
            <Reveal>One brief. One shortlist. Either way.</Reveal>
          </p>
        </div>
      </section>

      {/* What you see: one ranked list. */}
      <section aria-labelledby="see-heading" className="section-y">
        <div className="wrap">
          <h2 id="see-heading" className="display-lg mx-auto max-w-[18ch] text-center text-ink">
            <Reveal>Every candidate, one ranked list.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[30rem] text-center">
            <Reveal delay={0.06}>Disagree with any of it, and the system adjusts.</Reveal>
          </p>
          <div className="mx-auto mt-14 max-w-[56rem] overflow-hidden rounded-[22px] border border-hairline bg-paper shadow-lift">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4 sm:px-7">
              <p className="text-[15px] font-medium text-ink">Backend Engineer</p>
              <p className="label">Example</p>
            </div>
            <ol>
              {ROWS.map((r, i) => (
                <li key={r.name} className="grid gap-3 border-b border-hairline px-5 py-5 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-7">
                  <span className="label tabular-nums text-ink">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15.5px] font-medium text-ink">{r.name}</p>
                      <Pill>{r.source}</Pill>
                      <Pill tone="signal">Verified</Pill>
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
                  </div>
                  <p className="font-mono text-[1.75rem] font-medium tabular-nums tracking-[-0.04em] text-ink sm:text-right">
                    {r.score}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* What we need from you. */}
      <section aria-labelledby="need-heading" className="section-y bg-mist">
        <div className="wrap">
          <h2 id="need-heading" className="display-lg text-center text-ink">
            <Reveal>What we need from you.</Reveal>
          </h2>
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NEEDS.map((n) => (
              <li key={n.title} className="rounded-[22px] bg-paper p-7">
                <p className="text-[1.25rem] font-medium tracking-[-0.02em] text-ink">{n.title}</p>
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
