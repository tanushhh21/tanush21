import Reveal from "./Reveal";
import Logo from "./Logo";

export default function Close() {
  return (
    <section id="talk" aria-labelledby="close-heading" className="section-y bg-paper">
      <div className="wrap flex flex-col items-center text-center">
        <Reveal>
          <Logo size={44} />
        </Reveal>
        <p className="mt-6 text-[clamp(1.25rem,2vw,1.6rem)] font-medium tracking-[-0.02em] text-ink">
          <Reveal delay={0.06}>
            Find faster. Read smarter. <span className="text-signal">Hire better.</span>
          </Reveal>
        </p>
        <h2 id="close-heading" className="display-lg mt-16 max-w-[16ch] text-ink">
          <Reveal delay={0.12}>We are taking on three design&nbsp;partners.</Reveal>
        </h2>
        <p className="body-lg mt-6 max-w-[32rem]">
          <Reveal delay={0.18}>
            Hiring for a role that matters this quarter? Work directly with the founders, and help
            shape how Winnow works.
          </Reveal>
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
          <a href="mailto:hello@winnow.example" className="btn-primary">
            Talk to us
          </a>
          <a href="mailto:hello@winnow.example" className="link-chevron">
            hello@winnow.example <span aria-hidden="true">›</span>
          </a>
        </div>
      </div>
    </section>
  );
}
