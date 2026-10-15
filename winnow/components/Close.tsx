import Reveal from "./Reveal";
import Logo from "./Logo";

const MAIL = "mailto:hello@winnow.example?subject=Blind%20re-rank";

export default function Close() {
  return (
    <section id="talk" aria-labelledby="close-heading" className="section-y bg-mist">
      <div className="wrap flex flex-col items-center text-center">
        <Reveal>
          <Logo size={40} />
        </Reveal>
        <h2 id="close-heading" className="display-lg mt-10 text-ink">
          <Reveal delay={0.06}>Prove it before you commit.</Reveal>
        </h2>
        <p className="body-lg mt-5 max-w-[30rem]">
          <Reveal delay={0.12}>
            Give us ten roles you have already filled. We rank them blind and show you where your
            hire landed.
          </Reveal>
        </p>
        <div className="mt-10 flex flex-col items-center gap-5">
          <a href={MAIL} className="btn-primary">
            Run the blind test
          </a>
          <a href="mailto:hello@winnow.example" className="label link-underline">
            hello@winnow.example
          </a>
        </div>
        <p className="label mt-14">Paid on the hire · Nothing if nobody joins</p>
      </div>
    </section>
  );
}
