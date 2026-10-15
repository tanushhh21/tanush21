import Reveal from "./Reveal";

/** The opening of an inner page: a label, one large line, one short line. */
export default function PageHead({ label, title, sub }: { label: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="wrap flex flex-col items-center pt-[calc(4rem+clamp(4rem,12vh,8rem))] text-center">
      <p className="label">
        <Reveal>{label}</Reveal>
      </p>
      <h1 className="hero-tagline mt-6 max-w-[18ch] text-ink">
        <Reveal delay={0.06}>{title}</Reveal>
      </h1>
      {sub ? (
        <p className="body-lg mt-5 max-w-[32rem]">
          <Reveal delay={0.12}>{sub}</Reveal>
        </p>
      ) : null}
    </header>
  );
}
