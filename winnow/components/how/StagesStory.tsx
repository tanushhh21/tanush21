"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "../Reveal";

/**
 * The seven stages as a scroll story. The list scrolls normally; a pinned
 * drawing of the same few dots shows each stage, morphing from one to the next
 * as you read down. It sits beside the list on wide screens, and in a short
 * strip under the nav on phones.
 */

export const STAGES = [
  { title: "Brief", line: "Share the role. We draft the job description, or work from yours." },
  { title: "Distribute", line: "We publish it on Naukri, your careers page and campus platforms." },
  { title: "Source", line: "We search databases and talent networks for ideal candidates, including people who have not applied yet." },
  { title: "Evaluate", line: "We look past the CV for hidden signals, and assess every profile against your requirements." },
  { title: "Verify", line: "We verify identity and credentials before any interview." },
  { title: "Shortlist", line: "You receive a ranked list with the reasoning behind each candidate." },
  { title: "Schedule", line: "You choose who to meet. We book the interviews around your calendar and handle the back-and-forth." },
];

// ---- The drawing -----------------------------------------------------------

const N = 24;
const KEEP = [2, 5, 7, 9, 11, 14, 16, 18, 20, 22]; // the ten that make it through
const isKept = (i: number) => KEEP.includes(i);
const keptRank = (i: number) => KEEP.indexOf(i);

type Dot = { x: number; y: number; r: number; a: number; c: number; ring: number };
type Layout = Dot[];

const dot = (x: number, y: number, o: Partial<Dot> = {}): Dot => ({ x, y, r: 5, a: 0.85, c: 0, ring: 0, ...o });

// Deterministic jitter, so layouts never change between renders.
const rnd = (i: number, k: number) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function brief(): Layout {
  // The JD: four lines of "text" inside a page.
  const lines = [6, 5, 6, 4];
  const pts: Dot[] = [];
  lines.forEach((len, row) => {
    for (let k = 0; k < len; k++) pts.push(dot(0.3 + k * 0.08, 0.36 + row * 0.1, { r: 4.5 }));
  });
  while (pts.length < N) pts.push(dot(0.5, 0.5, { a: 0 }));
  return pts;
}

function distribute(): Layout {
  // A hub (the role) and six channels it goes out to.
  return Array.from({ length: N }, (_, i) => {
    if (i === 0) return dot(0.5, 0.5, { c: 1, a: 1, r: 7 });
    const node = (i - 1) % 6;
    const ang = (node / 6) * Math.PI * 2 - Math.PI / 2;
    const k = Math.floor((i - 1) / 6);
    const spread = 0.035;
    return dot(0.5 + Math.cos(ang) * 0.34 + (k - 1.5) * spread * Math.sin(ang), 0.5 + Math.sin(ang) * 0.34 - (k - 1.5) * spread * Math.cos(ang), { r: 4 });
  });
}

function source(): Layout {
  // Candidates arriving: applicants (filled) and people we found (rings).
  return Array.from({ length: N }, (_, i) =>
    dot(0.14 + rnd(i, 1) * 0.72, 0.14 + rnd(i, 2) * 0.72, { r: 4.5, a: 0.75, ring: i % 3 === 0 ? 1 : 0 }),
  );
}

function grid(i: number) {
  const col = i % 6;
  const row = Math.floor(i / 6);
  return { x: 0.2 + col * 0.12, y: 0.32 + row * 0.12 };
}

function evaluate(): Layout {
  return Array.from({ length: N }, (_, i) => {
    const g = grid(i);
    return dot(g.x, g.y, { r: 4.5, a: 0.75, ring: i % 3 === 0 ? 1 : 0 });
  });
}

function verify(): Layout {
  return Array.from({ length: N }, (_, i) => {
    const g = grid(i);
    return isKept(i) ? dot(g.x, g.y, { r: 5, a: 1, c: 1 }) : dot(g.x, g.y, { r: 4, a: 0.14 });
  });
}

function shortlist(): Layout {
  return Array.from({ length: N }, (_, i) => {
    if (!isKept(i)) return dot(grid(i).x, grid(i).y + 0.08, { r: 3, a: 0 });
    return dot(0.26, 0.18 + keptRank(i) * 0.072, { r: 4.5, c: 1, a: 1 });
  });
}

function schedule(): Layout {
  return Array.from({ length: N }, (_, i) => {
    if (!isKept(i)) return dot(0.5, 0.95, { r: 2, a: 0 });
    const k = keptRank(i);
    return dot(0.22 + (k % 5) * 0.14, 0.42 + Math.floor(k / 5) * 0.16, { r: 5, c: 1, a: 1 });
  });
}

function yours(): Layout {
  // The Winnow mark: nine ink, one signal.
  const slots: { x: number; y: number }[] = [];
  const s = 0.1;
  [4, 3, 2, 1].forEach((count, row) =>
    Array.from({ length: count }, (_, k) => slots.push({ x: 0.5 + (k - (count - 1) / 2) * s, y: 0.5 + (row - 1.5) * s * 0.866 })),
  );
  return Array.from({ length: N }, (_, i) => {
    if (!isKept(i)) return dot(0.5, 0.5, { r: 2, a: 0 });
    const k = keptRank(i);
    return dot(slots[k].x, slots[k].y, { r: 7.5, a: 1, c: k === 9 ? 1 : 0 });
  });
}

const LAYOUTS = [brief(), distribute(), source(), evaluate(), verify(), shortlist(), schedule(), yours()];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const INK = "#0A0C0F";
const SIGNAL = "#1B4DFF";
const HAIR = "#E8EAED";

// Dot sizes are tuned for a ~400px drawing; smaller drawings scale them down, gently.
const scaleFor = (S: number) => Math.min(1, Math.sqrt(S / 380));

function drawDecor(g: CanvasRenderingContext2D, stage: number, w: number, local: number, S: number) {
  if (w < 0.01) return;
  g.save();
  g.globalAlpha = w;
  g.lineWidth = 1;
  g.strokeStyle = HAIR;
  const px = (v: number) => v * S;
  if (stage === 0) {
    // The page the brief is written on.
    g.beginPath();
    g.roundRect(px(0.22), px(0.24), px(0.56), px(0.54), 14 * scaleFor(S));
    g.stroke();
  } else if (stage === 1) {
    for (let n = 0; n < 6; n++) {
      const ang = (n / 6) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.moveTo(px(0.5), px(0.5));
      g.lineTo(px(0.5 + Math.cos(ang) * 0.29), px(0.5 + Math.sin(ang) * 0.29));
      g.stroke();
    }
  } else if (stage === 3) {
    // The reading line, sweeping as you read this stage.
    const x = mix(0.12, 0.88, local);
    g.strokeStyle = INK;
    g.globalAlpha = w * 0.35;
    g.beginPath();
    g.moveTo(px(x), px(0.22));
    g.lineTo(px(x), px(0.78));
    g.stroke();
  } else if (stage === 5) {
    // A bar per name: the score.
    g.strokeStyle = HAIR;
    g.lineWidth = 6 * scaleFor(S);
    g.lineCap = "round";
    for (let k = 0; k < 10; k++) {
      const len = 0.42 - k * 0.026;
      g.beginPath();
      g.moveTo(px(0.33), px(0.18 + k * 0.072));
      g.lineTo(px(0.33 + len), px(0.18 + k * 0.072));
      g.stroke();
    }
  } else if (stage === 6) {
    // The week.
    for (let c = 0; c <= 5; c++) {
      g.beginPath();
      g.moveTo(px(0.15 + c * 0.14), px(0.34));
      g.lineTo(px(0.15 + c * 0.14), px(0.66));
      g.stroke();
    }
    for (let r = 0; r <= 2; r++) {
      g.beginPath();
      g.moveTo(px(0.15), px(0.34 + r * 0.16));
      g.lineTo(px(0.85), px(0.34 + r * 0.16));
      g.stroke();
    }
  }
  g.restore();
}

function render(g: CanvasRenderingContext2D, S: number, sp: number) {
  g.clearRect(0, 0, S, S);
  const s = Math.min(LAYOUTS.length - 2, Math.floor(sp));
  const t = clamp01(sp - s);
  const f = smooth(0.35, 0.85, t); // hold each stage, then morph to the next
  drawDecor(g, s, 1 - f, smooth(0, 0.6, t), S);
  drawDecor(g, s + 1, f, 0, S);
  const A = LAYOUTS[s];
  const B = LAYOUTS[s + 1];
  const k = scaleFor(S);
  // During Evaluate, dots darken as the line passes them.
  const scanX = s === 3 ? mix(0.12, 0.88, smooth(0, 0.6, t)) : -1;
  for (let i = 0; i < N; i++) {
    const a = A[i];
    const b = B[i];
    const e = smooth(0, 1, clamp01((f - (i % 6) * 0.02) / 0.9));
    const x = mix(a.x, b.x, e) * S;
    const y = mix(a.y, b.y, e) * S;
    const r = mix(a.r, b.r, e) * k;
    let alpha = mix(a.a, b.a, e);
    if (scanX > 0 && a.x < scanX) alpha = Math.min(1, alpha + 0.25 * (1 - f));
    const c = mix(a.c, b.c, e);
    const ring = mix(a.ring, b.ring, e);
    if (alpha < 0.01) continue;
    g.globalAlpha = alpha;
    g.fillStyle = c > 0.5 ? SIGNAL : INK;
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (ring > 0.5) g.stroke();
    else g.fill();
  }
  g.globalAlpha = 1;
}

// ---- The list --------------------------------------------------------------

// Where the reader's eye is: mid-screen beside the list, or just below the strip on phones.
const NAV = 64;
const readingLine = (wide: boolean, strip: number) => {
  const top = NAV + strip;
  return wide ? window.innerHeight * 0.5 : top + (window.innerHeight - top) * 0.4;
};

export default function StagesStory() {
  const listRef = useRef<HTMLOListElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const rows = Array.from(listRef.current!.children) as HTMLElement[];
    const g = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 768px)");
    let S = 0;
    let raf = 0;
    // The stage as a continuous index: whole at a row's centre, fractional between rows.
    const position = () => {
      if (reduce) return LAYOUTS.length - 1;
      const y = readingLine(wide.matches, canvas.parentElement!.offsetHeight);
      const mid = rows.map((r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      if (y <= mid[0]) return 0;
      for (let i = 0; i < mid.length - 1; i++) {
        if (y < mid[i + 1]) return i + (y - mid[i]) / (mid[i + 1] - mid[i]);
      }
      return mid.length - 1;
    };
    const draw = () => {
      raf = 0;
      const sp = position();
      g.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      render(g, S, sp);
      const s = Math.floor(sp);
      const idx = Math.min(LAYOUTS.length - 1, sp - s > 0.6 ? s + 1 : s);
      setActive((prev) => (prev === idx ? prev : idx));
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      S = canvas.getBoundingClientRect().width;
      canvas.width = canvas.height = Math.round(S * dpr);
      kick();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
    };
  }, []);

  const rowState = (i: number) => (i === active ? "is-active" : i < active ? "is-past" : "");

  return (
    <section aria-label="Stages" className="relative">
      {/* Not a grid on phones, so the strip stays pinned for the whole list. */}
      <div className="wrap md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:gap-x-16">
        {/* The drawing: pinned beside the list on wide screens, under the nav on phones. */}
        <div className="sticky top-16 z-10 -mx-5 flex h-44 items-center max-md:[@media(max-height:700px)]:h-32 justify-center border-b border-hairline bg-paper sm:-mx-6 md:order-2 md:top-0 md:mx-0 md:h-[100svh] md:border-0 md:bg-transparent motion-reduce:hidden">
          <canvas ref={canvasRef} aria-hidden="true" className="block size-40 max-md:[@media(max-height:700px)]:size-28 md:aspect-square md:size-auto md:w-full" />
        </div>

        <ol ref={listRef} className="stages relative md:order-1 md:py-[18vh]">
          {STAGES.map((s, i) => (
            <li key={s.title} className={`stage grid grid-cols-[3rem_minmax(0,1fr)] content-center gap-x-4 py-7 md:min-h-[42vh] md:py-0 ${rowState(i)}`}>
              <span className="stage-n label tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="stage-title text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-[-0.03em]">
                  {s.title}
                </h2>
                <p className="stage-line mt-2 max-w-[28rem] text-[clamp(1rem,1.3vw,1.2rem)] leading-snug">{s.line}</p>
              </div>
            </li>
          ))}
          <li className={`stage grid grid-cols-[3rem_minmax(0,1fr)] content-center gap-x-4 py-7 md:min-h-[42vh] md:py-0 ${rowState(7)}`}>
            <span aria-hidden="true" className="mt-[0.6em] h-2.5 w-2.5 rounded-full bg-signal" />
            <div>
              <p className="font-display text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-[-0.03em] text-signal">
                <Reveal>Then it&rsquo;s your call.</Reveal>
              </p>
              <p className="mt-2 text-[clamp(1rem,1.3vw,1.2rem)] leading-snug text-ink">
                <Reveal delay={0.06}>You interview and make the offer.</Reveal>
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
