import Reveal from "./Reveal";
import Logo from "./Logo";
import { MAIL } from "@/lib/site";

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
            Share ten roles you have already filled. We rank each applicant pool without knowing who you hired, then
            show you where your hire placed.
          </Reveal>
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
          <a href={`${MAIL}?subject=Blind%20re-rank`} className="btn-primary">
            Request a blind test
          </a>
          <a href="/pricing" className="link-chevron">
            See pricing <span aria-hidden="true">›</span>
          </a>
        </div>
      </div>
    </section>
  );
}
