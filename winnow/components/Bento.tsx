import Reveal from "./Reveal";
import { Mark } from "./Logo";
import { CHANNELS } from "@/lib/field";

function Tile({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col justify-between rounded-[28px] bg-paper p-7 sm:p-9 ${className}`}>{children}</div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[clamp(3rem,6.5vw,5.25rem)] font-medium leading-none tracking-[-0.06em] tabular-nums text-ink [word-spacing:-0.3em]">
      {children}
    </p>
  );
}

function Copy({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[26rem] text-[clamp(1.0625rem,1.4vw,1.25rem)] leading-snug text-slate">{children}</p>;
}

export function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "signal" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] leading-tight ${
        tone === "signal" ? "border-signal/30 bg-signal/[0.06] text-signal" : "border-hairline bg-paper text-ink"
      }`}
    >
      {children}
    </span>
  );
}

export default function Bento() {
  return (
    <section id="why" aria-labelledby="why-heading" className="section-y bg-mist">
      <div className="wrap">
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="label">
            <Reveal>Why Winnow</Reveal>
          </p>
          <h2 id="why-heading" className="display-lg mt-5 text-ink">
            <Reveal delay={0.06}>Better hires, without the haystack.</Reveal>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
          <Tile className="min-h-[19rem] md:col-span-2">
            <span className="label">A résumé&rsquo;s first look, today</span>
            <div className="mt-10">
              <Big>8 seconds</Big>
              <Copy>
                That is all most applications get. Great people are skipped for a missing keyword.
                <span className="text-ink"> Winnow reads every profile in full.</span>
              </Copy>
            </div>
          </Tile>

          <Tile className="min-h-[19rem]">
            <span className="label">Sourcing</span>
            <div className="mt-10">
              <Big>6</Big>
              <Copy>channels searched as one pipeline, not just your inbound.</Copy>
              <div className="mt-6 flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </div>
            </div>
          </Tile>

          <Tile className="min-h-[19rem]">
            <span className="label">Shortlist</span>
            <div className="mt-10">
              <div className="flex items-end gap-5">
                <Big>10</Big>
                <Mark className="mb-2 h-10 w-auto text-ink" />
              </div>
              <Copy>names on every shortlist, each with the reasons behind it and the risks worth probing.</Copy>
            </div>
          </Tile>

          <Tile className="min-h-[19rem]">
            <span className="label">Speed</span>
            <div className="mt-10">
              <Big>7 days</Big>
              <Copy>from your brief to a shortlist of people who have already said yes to a call.</Copy>
              <div className="mt-6 flex flex-wrap gap-2">
                <Tag>Brief</Tag>
                <Tag>Search</Tag>
                <Tag tone="signal">Shortlist</Tag>
              </div>
            </div>
          </Tile>

          <Tile className="min-h-[19rem]">
            <span className="label">Pricing</span>
            <div className="mt-10">
              <Big>₹0</Big>
              <Copy>upfront. You pay a success fee only when someone we introduced joins.</Copy>
              <div className="mt-6 flex flex-wrap gap-2">
                <Tag>No retainer</Tag>
                <Tag>No seat licences</Tag>
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}
