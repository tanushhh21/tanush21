import Reveal from "./Reveal";

const INCLUDED = [
  "Sourcing across every channel, not only your inbound",
  "Full-profile evaluation against your rubric",
  "Outreach, interest checks, notice period and CTC",
  "Scheduling for first conversations",
  "A shared channel with live progress",
];

export default function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="section-y bg-mist">
      <div className="wrap grid gap-14 md:grid-cols-2 md:gap-16">
        <div>
          <p className="label">
            <Reveal>Pricing</Reveal>
          </p>
          <h2 id="pricing-heading" className="display-lg mt-5 text-ink">
            <Reveal delay={0.06}>Pay when someone joins.</Reveal>
          </h2>
          <p className="body-lg mt-6 max-w-[30rem]">
            <Reveal delay={0.12}>
              No retainer and no seat licences. A success fee on first-year CTC, charged only when a
              candidate we introduced accepts and joins.
            </Reveal>
          </p>
        </div>
        <div className="md:pt-2">
          <p className="label">Included in every search</p>
          <ul className="mt-5 border-t border-hairline">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-4 border-b border-hairline py-4 text-[16px] text-ink"
              >
                <span aria-hidden="true" className="h-px w-3 shrink-0 translate-y-[-4px] bg-ink" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
