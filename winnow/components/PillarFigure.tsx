"use client";

import { m } from "motion/react";
import { EASE_STATE } from "./motion";

/**
 * One figure, three states. Every state is built from the same ten cubic
 * strokes, one signal stroke and ten nodes, so moving between steps is a
 * morph of the same marks rather than a cut.
 *
 *   Source     ten channels converge into one pipeline (signal).
 *   Evaluate   the channels straighten into lines of a read document; one
 *              passage is underlined (signal).
 *   Shortlist  ten short rows, each with its node filled (signal).
 */

const ROWS = 10;
const rowY = (i: number) => 56 + i * 32;
const line = (x0: number, y0: number, x1: number, y1: number) =>
  `M${x0} ${y0} C${x0 + (x1 - x0) / 3} ${y0 + (y1 - y0) / 3} ${x0 + (2 * (x1 - x0)) / 3} ${y0 + (2 * (y1 - y0)) / 3} ${x1} ${y1}`;

const DOC = [300, 276, 292, 150, 296, 262, 288, 124, 300, 206];
const NAMES = [168, 212, 150, 196, 182, 140, 220, 160, 190, 174];

type State = {
  strokes: string[];
  signal: string;
  signalOpacity: number;
  nodes: { cx: number; cy: number; r: number; filled: boolean }[];
};

const STATES: State[] = [
  {
    strokes: Array.from({ length: ROWS }, (_, i) => {
      const y = rowY(i);
      return `M28 ${y} C150 ${y} 168 200 252 200`;
    }),
    signal: line(252, 200, 376, 200),
    signalOpacity: 1,
    nodes: Array.from({ length: ROWS }, (_, i) => ({ cx: 28, cy: rowY(i), r: 3, filled: false })),
  },
  {
    strokes: Array.from({ length: ROWS }, (_, i) => line(64, rowY(i), 64 + DOC[i], rowY(i))),
    signal: line(112, rowY(5) + 9, 300, rowY(5) + 9),
    signalOpacity: 1,
    nodes: Array.from({ length: ROWS }, (_, i) => ({ cx: 40, cy: rowY(i), r: 1.5, filled: false })),
  },
  {
    strokes: Array.from({ length: ROWS }, (_, i) => line(100, rowY(i), 100 + NAMES[i], rowY(i))),
    signal: line(64, rowY(0), 64, rowY(0)),
    signalOpacity: 0,
    nodes: Array.from({ length: ROWS }, (_, i) => ({ cx: 68, cy: rowY(i), r: 4.5, filled: true })),
  },
];

const T = { duration: 0.8, ease: EASE_STATE };

export default function PillarFigure({ step, className = "" }: { step: number; className?: string }) {
  const s = STATES[step];
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden="true"
      className={`h-auto w-full ${className}`}
    >
      {s.strokes.map((d, i) => (
        <m.path
          key={i}
          initial={false}
          animate={{ d }}
          transition={{ ...T, delay: i * 0.018 }}
          stroke="var(--color-ink)"
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      ))}
      <m.path
        initial={false}
        animate={{ d: s.signal, opacity: s.signalOpacity }}
        transition={T}
        stroke="var(--color-signal)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      {s.nodes.map((n, i) => (
        <m.circle
          key={i}
          initial={false}
          animate={{
            cx: n.cx,
            cy: n.cy,
            r: n.r,
            fill: n.filled ? "#1B4DFF" : "#FFFFFF",
            stroke: n.filled ? "#1B4DFF" : "#0A0C0F",
          }}
          transition={{ ...T, delay: i * 0.018 }}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
