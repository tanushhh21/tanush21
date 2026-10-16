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
          <Reveal delay={0.06}>Tell us about your next hire.</Reveal>
        </h2>
        <p className="body-lg mt-5 max-w-[30rem]">
          <Reveal delay={0.12}>
            Share the role and we&rsquo;ll take it from there. Not sure yet? Test us on a role you&rsquo;ve already
            filled.
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
