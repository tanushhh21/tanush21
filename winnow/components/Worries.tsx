import ScrollVar from "./ScrollVar";
import Logo from "./Logo";

type Size = "XL" | "L" | "M" | "S";
type Worry = { t: string; s: Size; at: [number, number]; m?: [number, number] };

// Where each worry sits, as % of the stage: `at` on desktop, `m` on phones
// (phones show fewer). Listed in the order they appear.
const WORRIES: Worry[] = [
  { t: "Complicated.", s: "L", at: [20, 15], m: [30, 15] },
  { t: "Will I find the right fit?", s: "M", at: [32, 30], m: [44, 34] },
  { t: "The good ones never apply.", s: "M", at: [71, 69], m: [62, 73] },
  { t: "Hard.", s: "XL", at: [84, 18], m: [80, 19] },
  { t: "Everyone who applied isn't good enough.", s: "S", at: [27, 70], m: [50, 81] },
  { t: "This is taking too long.", s: "M", at: [52, 12], m: [50, 26] },
  { t: "Hundreds of CVs. None of them right.", s: "S", at: [69, 30] },
  { t: "Expensive.", s: "M", at: [9, 50], m: [24, 66] },
  { t: "Is this person who they say they are?", s: "S", at: [47, 85] },
  { t: "Another bad hire?", s: "S", at: [91, 48], m: [72, 89] },
  { t: "Candidates who go silent.", s: "S", at: [14, 86] },
  { t: "Endless back-and-forth on interviews.", s: "S", at: [82, 87] },
];

const SIZE: Record<Size, string> = {
  XL: "font-display text-[clamp(2.25rem,4.2vw,3.75rem)] font-semibold tracking-[-0.03em] text-ink",
  L: "font-display text-[clamp(1.75rem,3vw,2.75rem)] font-semibold tracking-[-0.025em] text-ink",
  M: "font-display text-[clamp(1.125rem,2vw,1.75rem)] font-semibold tracking-[-0.015em] text-ink/80",
  S: "text-[clamp(0.95rem,1.45vw,1.3rem)] font-medium text-slate",
};

// Deterministic noise, so server and client render the same values.
const noise = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const v = (n: number, unit = "") => `${n.toFixed(2)}${unit}`;

/** One worry: it arrives, is struck through, then blows away letter by letter like chaff. */
function Phrase({ w, i }: { w: Worry; i: number }) {
  const chars = Array.from(w.t);
  const style = {
    "--x": `${w.at[0]}%`,
    "--y": `${w.at[1]}%`,
    "--mx": `${(w.m ?? w.at)[0]}%`,
    "--my": `${(w.m ?? w.at)[1]}%`,
    "--a0": v(0.03 + i * 0.024),
    "--s0": v(0.38 + i * 0.013, ""),
    "--b0": v(0.57 + (w.at[0] / 100) * 0.07),
  } as React.CSSProperties;
  return (
    <p className={`worry ${SIZE[w.s]} ${w.m ? "" : "hidden md:block"}`} style={style}>
      {chars.map((c, j) => (
        <span
          key={j}
          className="worry-l"
          style={
            {
              "--d": v((1 - j / chars.length) * 0.5 + noise(i, j) * 0.08),
              "--lx": v(60 + noise(j, i + 7) * 220, "px"),
              "--ly": v(30 - noise(i + 3, j) * 150, "px"),
              "--lr": v((noise(j + 5, i) - 0.3) * 160, "deg"),
            } as React.CSSProperties
          }
        >
          {c}
        </span>
      ))}
      <span aria-hidden="true" className="worry-strike" />
    </p>
  );
}

const intro = (a0: number) => ({ "--a0": v(a0) }) as React.CSSProperties;

/**
 * What comes to mind when you think of hiring? The worries fill the screen,
 * are struck out one by one and winnowed away, and Winnow is introduced.
 * Pinned and scrubbed by scroll; with reduced motion it shows the introduction.
 */
export default function Worries() {
  return (
    <section aria-labelledby="worries-heading">
      <ScrollVar className="worries relative h-[340vh] bg-paper">
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          {/* Everything is laid out in the space below the nav. */}
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-16">
            {WORRIES.map((w, i) => (
              <Phrase key={w.t} w={w} i={i} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-16 flex items-center justify-center px-5">
            <h2 id="worries-heading" className="worries-q display-lg max-w-[16ch] text-center text-ink">
              What comes to mind when you think of hiring?
            </h2>
          </div>
          <p className="sr-only">
            Complicated. Hard. Slow. Expensive. Will I find the right fit? The good ones never apply, and everyone
            who applied isn&rsquo;t good enough. Winnow takes these away.
          </p>
          <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col items-center justify-center px-5 text-center">
            <p className="worries-in eyebrow" style={intro(0.74)}>
              Introducing
            </p>
            <div className="worries-in mt-5" style={intro(0.77)}>
              <Logo size="clamp(3.5rem, 9vw, 7rem)" />
            </div>
            <p
              className="worries-in mt-8 font-display text-[clamp(1.5rem,3vw,2.5rem)] font-semibold tracking-[-0.025em] text-ink"
              style={intro(0.82)}
            >
              Hiring, without the hard parts.
            </p>
            <p className="worries-in body-lg mt-4 max-w-[34rem]" style={intro(0.86)}>
              Winnow finds the right people and checks every one of them. You pick who to meet, and we take care of the scheduling.
            </p>
          </div>
        </div>
      </ScrollVar>
    </section>
  );
}
