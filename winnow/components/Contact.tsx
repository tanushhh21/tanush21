import Reveal from "./Reveal";
import Logo from "./Logo";
import InquiryForm from "./InquiryForm";

/** The section every page closes on: join the waitlist so we can run a hire for you. */
export default function Contact({ logo = false }: { logo?: boolean }) {
  return (
    <section id="talk" aria-labelledby="contact-heading" className="section-y bg-mist">
      <div className="wrap flex flex-col items-center text-center">
        {logo ? (
          <div className="mb-10">
            <Reveal>
              <Logo size={40} />
            </Reveal>
          </div>
        ) : null}
        <h2 id="contact-heading" className="display-lg text-ink">
          <Reveal>Let us run your next hire.</Reveal>
        </h2>
        <p className="body-lg mt-5 max-w-[30rem]">
          <Reveal delay={0.06}>
            Join the waitlist. Tell us what you&rsquo;re hiring for, and we&rsquo;ll be in touch when we&rsquo;re ready for your team.
          </Reveal>
        </p>
        <InquiryForm kind="waitlist" />
      </div>
    </section>
  );
}
