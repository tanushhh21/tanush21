import Reveal from "./Reveal";
import Logo from "./Logo";

export default function Close() {
  return (
    <section id="talk" aria-labelledby="close-heading" className="section-y bg-mist">
      <div className="wrap flex flex-col items-center text-center">
        <Reveal>
          <Logo size={48} />
        </Reveal>
        <h2 id="close-heading" className="hero-tagline mt-8 text-ink">
          <Reveal delay={0.06}>
            Find faster. Read smarter. <span className="text-signal">Hire better.</span>
          </Reveal>
        </h2>
        <div className="mt-10 flex flex-col items-center gap-5">
          <a href="mailto:hello@winnow.example" className="btn-primary">
            Talk to us
          </a>
          <a href="mailto:hello@winnow.example" className="label link-underline">
            hello@winnow.example
          </a>
        </div>
      </div>
    </section>
  );
}
