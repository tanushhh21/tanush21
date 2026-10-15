"use client";

import { useEffect, useRef } from "react";

/**
 * One figure, three states. Every state is the same ten cubic strokes, one
 * signal stroke and ten nodes, all plain numbers, so moving between steps is
 * a morph of the same marks rather than a cut.
 *
 *   Source     ten channels converge into one pipeline (signal).
 *   Evaluate   the channels straighten into lines of a read document; one
 *              passage is underlined (signal).
 *   Shortlist  ten short rows, each with its node filled (signal).
 *
 * The morph writes attributes directly from a short RAF tween rather than
 * through motion components: 21 marks per figure, and a figure per step on
 * small screens, made hydration the most expensive thing on the page.
 */

const ROWS = 10;
const rowY = (i: number) => 56 + i * 32;
type Curve = number[]; // x0 y0 c1x c1y c2x c2y x1 y1
type Node = number[]; // cx cy r fill(0 paper .. 1 signal)
type State = { strokes: Curve[]; signal: Curve; signalOpacity: number; nodes: Node[] };

const line = (x0: number, y0: number, x1: number, y1: number): Curve => [
  x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1,
];
const rows = <T,>(f: (i: number) => T) => Array.from({ length: ROWS }, (_, i) => f(i));

const DOC = [300, 276, 292, 150, 296, 262, 288, 124, 300, 206];
const NAMES = [168, 212, 150, 196, 182, 140, 220, 160, 190, 174];

const STATES: State[] = [
  {
    strokes: rows((i) => [28, rowY(i), 150, rowY(i), 168, 200, 252, 200]),
    signal: line(252, 200, 376, 200),
    signalOpacity: 1,
    nodes: rows((i) => [28, rowY(i), 3, 0]),
  },
  {
    strokes: rows((i) => line(64, rowY(i), 64 + DOC[i], rowY(i))),
    signal: line(112, rowY(5) + 9, 300, rowY(5) + 9),
    signalOpacity: 1,
    nodes: rows((i) => [40, rowY(i), 1.5, 0]),
  },
  {
    strokes: rows((i) => line(100, rowY(i), 100 + NAMES[i], rowY(i))),
    signal: line(64, rowY(0), 64, rowY(0)),
    signalOpacity: 0,
    nodes: rows((i) => [68, rowY(i), 4.5, 1]),
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const toD = (c: Curve) => `M${r2(c[0])} ${r2(c[1])}C${r2(c[2])} ${r2(c[3])} ${r2(c[4])} ${r2(c[5])} ${r2(c[6])} ${r2(c[7])}`;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixArr = (a: number[], b: number[], t: number) => a.map((v, i) => mix(v, b[i], t));
const PAPER = [255, 255, 255];
const SIGNAL = [27, 77, 255];
const INK = [10, 12, 15];
const rgb = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(mix(a[0], b[0], t))} ${Math.round(mix(a[1], b[1], t))} ${Math.round(mix(a[2], b[2], t))})`;

// cubic-bezier(0.4, 0, 0.2, 1), the state-change easing, solved by Newton steps.
function easeStandard(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const f = 1.2 * t * (1 - t) ** 2 + 0.6 * t * t * (1 - t) + t ** 3 - x;
    const d = 1.2 * (1 - t) ** 2 - 1.2 * t * (1 - t) + 2.4 * t * t;
    if (Math.abs(f) < 1e-5 || d === 0) break;
    t -= f / d;
  }
  return 3 * t * t * (1 - t) + t ** 3;
}

const DURATION = 800;
const STAGGER = 18;

function apply(svg: SVGSVGElement, s: State) {
  const paths = svg.querySelectorAll("path");
  const nodes = svg.querySelectorAll("circle");
  s.strokes.forEach((c, i) => paths[i].setAttribute("d", toD(c)));
  const signal = paths[ROWS];
  signal.setAttribute("d", toD(s.signal));
  signal.setAttribute("opacity", s.signalOpacity.toFixed(3));
  s.nodes.forEach((n, i) => {
    const c = nodes[i];
    c.setAttribute("cx", r2(n[0]).toString());
    c.setAttribute("cy", r2(n[1]).toString());
    c.setAttribute("r", r2(n[2]).toString());
    c.setAttribute("fill", rgb(PAPER, SIGNAL, n[3]));
    c.setAttribute("stroke", rgb(INK, SIGNAL, n[3]));
  });
}

/** Static markup for a state. Rendered once; later states are written by the tween. */
function Marks({ s }: { s: State }) {
  return (
    <>
      {s.strokes.map((c, i) => (
        <path
          key={i}
          d={toD(c)}
          stroke="var(--color-ink)"
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      ))}
      <path
        d={toD(s.signal)}
        opacity={s.signalOpacity}
        stroke="var(--color-signal)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      {s.nodes.map((n, i) => (
        <circle
          key={i}
          cx={n[0]}
          cy={n[1]}
          r={n[2]}
          fill={rgb(PAPER, SIGNAL, n[3])}
          stroke={rgb(INK, SIGNAL, n[3])}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

const svgProps = { viewBox: "0 0 400 400", fill: "none", "aria-hidden": true } as const;

/** A figure fixed at one state (stacked layout, reduced motion). */
export function StaticFigure({ step }: { step: number }) {
  return (
    <svg {...svgProps} className="h-auto w-full">
      <Marks s={STATES[step]} />
    </svg>
  );
}

/** A figure that morphs whenever `step` changes. */
export default function PillarFigure({ step }: { step: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shown = useRef<State>(STATES[0]);

  useEffect(() => {
    const svg = svgRef.current!;
    const from = shown.current;
    const to = STATES[step];
    if (from === to) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const el = now - t0;
      const at = (i: number) => easeStandard((el - i * STAGGER) / DURATION);
      const ts = easeStandard(el / DURATION);
      const s: State = {
        strokes: from.strokes.map((c, i) => mixArr(c, to.strokes[i], at(i))),
        signal: mixArr(from.signal, to.signal, ts),
        signalOpacity: mix(from.signalOpacity, to.signalOpacity, ts),
        nodes: from.nodes.map((n, i) => mixArr(n, to.nodes[i], at(i))),
      };
      apply(svg, s);
      shown.current = s;
      if (el < DURATION + STAGGER * ROWS) raf = requestAnimationFrame(tick);
      else shown.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // Markup is always the first state; React never re-renders the marks, so the
  // tween owns their attributes after mount.
  return (
    <svg ref={svgRef} {...svgProps} className="h-auto w-full">
      <Marks s={STATES[0]} />
    </svg>
  );
}
