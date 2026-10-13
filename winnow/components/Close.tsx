import Reveal from "./Reveal";

export default function Close() {
  return (
    <section id="talk" aria-labelledby="close-heading" className="section-y bg-paper">
      <div className="wrap flex flex-col items-center text-center">
        <p className="label">
          <Reveal>Design partners</Reveal>
        </p>
        <h2 id="close-heading" className="display-lg mt-5 max-w-[16ch] text-ink">
          <Reveal delay={0.06}>We are taking on three design&nbsp;partners.</Reveal>
        </h2>
        <p className="body-lg mt-6 max-w-[32rem]">
          <Reveal delay={0.12}>
            Hiring for a role that matters this quarter? Work directly with the founders, and help
            shape how Winnow works.
          </Reveal>
        </p>
        <Reveal delay={0.18} className="mt-10">
          <a
            href="mailto:hello@winnow.example"
            className="inline-flex items-center rounded-full bg-ink px-8 py-4 text-[15px] font-medium text-paper shadow-lift transition-[transform,box-shadow] duration-200 ease-standard hover:-translate-y-0.5 hover:shadow-lift-hover"
          >
            Talk to us
          </a>
        </Reveal>
        <Reveal delay={0.24} className="mt-8">
          <a href="mailto:hello@winnow.example" className="label link-underline">
            hello@winnow.example
          </a>
        </Reveal>
      </div>
    </section>
  );
}
