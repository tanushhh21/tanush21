import Reveal from "./Reveal";
import Logo from "./Logo";
import InquiryForm from "./InquiryForm";
import { EMAIL, MAIL } from "@/lib/site";

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
