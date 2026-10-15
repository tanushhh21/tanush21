import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import PageHead from "@/components/PageHead";
import BlindTest from "@/components/BlindTest";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Pricing",
  ...pageMeta("/pricing", "Pricing · Winnow", "Paid on the hire. No licence, no monthly minimum, no setup fee. If nobody joins, you pay nothing."),
};

const INCLUDED = [
  "Job description",
  "Job distribution",
  "Candidate sourcing",
  "Candidate evaluation",
  "Identity and credential checks",
  "Ranked shortlist with reasoning",
  "Interview scheduling",
];
const NONE = ["Licence", "Monthly minimum", "Setup fee"];

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0 text-signal">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <main>
      <PageHead label="Pricing" title="You pay only when you hire." sub="No hire, no fee." />

      <section aria-label="Plan" className="section-y">
        <div className="wrap">
          <div className="mx-auto grid max-w-[60rem] overflow-hidden rounded-[28px] border border-hairline bg-paper shadow-lift md:grid-cols-2">
            <div className="flex flex-col justify-between p-8 sm:p-11">
              <div>
                <p className="eyebrow">Per role</p>
                <p className="mt-6 font-display text-[clamp(2.5rem,5vw,3.75rem)] font-semibold leading-none tracking-[-0.04em] text-ink">
                  Success fee
                </p>
                <p className="mt-5 max-w-[22rem] text-[1.0625rem] leading-snug text-slate">
                  A percentage of first-year CTC, charged only when a candidate we introduced joins.
                </p>
              </div>
              <div className="mt-10">
                <a href="#talk" className="btn-primary">
                  Talk to us
                </a>
              </div>
            </div>
            <div className="border-t border-hairline bg-mist p-8 sm:p-11 md:border-l md:border-t-0">
              <p className="eyebrow">Included on every role</p>
              <ul className="mt-6 grid gap-3.5">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[15.5px] text-ink">
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <ul className="mx-auto mt-10 flex max-w-[60rem] flex-wrap justify-center gap-3">
            {NONE.map((n) => (
              <li key={n} className="rounded-full border border-hairline px-4 py-2 text-[14px] text-slate">
                <span className="text-ink">No</span> {n.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-12 text-center text-[1.25rem] font-medium tracking-[-0.015em] text-ink">
            <Reveal>Pricing tied to outcomes, not seats.</Reveal>
          </p>
        </div>
      </section>

      <BlindTest />
    </main>
  );
}
