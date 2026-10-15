import Reveal from "./Reveal";
import InquiryForm from "./InquiryForm";
import { EMAIL, MAIL } from "@/lib/site";

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
        <InquiryForm />
        <p className="mt-8 text-[15px] text-slate">
          Or email us at{" "}
          <a href={MAIL} className="link-underline text-ink">
            {EMAIL}
          </a>
        </p>
      </div>
    </section>
  );
}
