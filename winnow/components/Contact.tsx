import Reveal from "./Reveal";
import InquiryForm from "./InquiryForm";
import { EMAIL, MAIL } from "@/lib/site";

/** The "Talk to us" section that closes How we work and Pricing. */
export default function Contact({ tone = "mist" }: { tone?: "mist" | "paper" }) {
  return (
    <section id="talk" aria-labelledby="contact-heading" className={`section-y ${tone === "mist" ? "bg-mist" : "bg-paper"}`}>
      <div className="wrap flex flex-col items-center text-center">
        <h2 id="contact-heading" className="display-lg text-ink">
          <Reveal>Tell us about your next hire.</Reveal>
        </h2>
        <p className="body-lg mt-5 max-w-[30rem]">
          <Reveal delay={0.06}>
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
