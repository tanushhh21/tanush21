import Reveal from "./Reveal";
import { MAIL } from "@/lib/site";

/** The offer from the PRD: a blind re-rank of roles already filled. */
export default function BlindTest({ tone = "mist" }: { tone?: "mist" | "paper" }) {
  return (
    <section id="talk" aria-labelledby="blind-heading" className={`section-y ${tone === "mist" ? "bg-mist" : "bg-paper"}`}>
      <div className="wrap flex flex-col items-center text-center">
        <h2 id="blind-heading" className="display-lg text-ink">
          <Reveal>Prove it before you commit.</Reveal>
        </h2>
        <p className="body-lg mt-5 max-w-[30rem]">
          <Reveal delay={0.06}>
            Share ten roles you have already filled. We rank each applicant pool without knowing who you hired, then
            show you where your hire placed.
          </Reveal>
        </p>
        <div className="mt-10">
          <a href={`${MAIL}?subject=Blind%20re-rank`} className="btn-primary">
            Request a blind test
          </a>
        </div>
      </div>
    </section>
  );
}
