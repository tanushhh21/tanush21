import Reveal from "../Reveal";

const SOURCES = [
  "Naukri Resdex",
  "LinkedIn",
  "GitHub",
  "Internshala",
  "Unstop",
  "Campus networks",
  "Referrals",
  "Your past applicants",
];

const SIGNALS = [
  { title: "Career trajectory", line: "Growth, tenure and the moves between roles." },
  { title: "Real work", line: "Projects, open-source contributions and work samples." },
  { title: "Consistency", line: "Whether the CV, online profiles and checks agree." },
  { title: "Verified facts", line: "Identity and credentials, confirmed before interviews." },
];

/** Sourcing reach, and the signals we weigh beyond the CV. */
export default function HiddenSignals() {
  return (
    <section aria-labelledby="signals-heading" className="section-y">
      <div className="wrap">
        <div className="mx-auto max-w-[44rem] text-center">
          <h2 id="signals-heading" className="display-lg text-ink">
            <Reveal>We find the hidden signals.</Reveal>
          </h2>
          <p className="body-lg mx-auto mt-5 max-w-[36rem]">
            <Reveal delay={0.06}>
              Our sourcing searches a wide range of databases and networks to find ideal candidates, including people who
              have not applied yet.
            </Reveal>
          </p>
        </div>

        <ul className="mx-auto mt-10 flex max-w-[52rem] flex-wrap justify-center gap-2.5">
          {SOURCES.map((s, i) => (
            <li
              key={s}
              data-reveal=""
              className="rise rounded-full border border-hairline px-4 py-2 text-[14.5px] text-ink"
              style={{ "--reveal-delay": `${i * 0.05}s` } as React.CSSProperties}
            >
              {s}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-20 max-w-[60rem]">
          <p className="text-center font-display text-[clamp(1.25rem,2vw,1.6rem)] font-semibold tracking-[-0.02em] text-ink">
            <Reveal>A polished CV is easy to write. These are not.</Reveal>
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SIGNALS.map((s, i) => (
              <li
                key={s.title}
                data-reveal=""
                className="rise rounded-[22px] bg-mist p-7"
                style={{ "--reveal-delay": `${i * 0.08}s` } as React.CSSProperties}
              >
                <span aria-hidden="true" className="block h-2.5 w-2.5 rounded-full bg-signal" />
                <p className="mt-6 font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">{s.title}</p>
                <p className="mt-2 text-[15px] leading-snug text-slate">{s.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
