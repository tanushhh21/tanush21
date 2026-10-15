"use client";

import { useEffect, useRef } from "react";
import { easeOut, prefersReducedMotion, useOnceInView } from "./useOnceInView";

const fmt = new Intl.NumberFormat("en-IN");

type Kind = "volume" | "scarce";

/**
 * Two roles, two problems. Volume: a pile of applicants arrives and a line
 * reads through every one. Scarce: nine applicants, so sourced candidates
 * (rings) fly in to join them.
 */
function Strip({ kind, run }: { kind: Kind; run: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!run) return; // nothing to draw until it is seen
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.getBoundingClientRect().width;
    const H = c.getBoundingClientRect().height;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = (i: number, k: number) => {
      const s = Math.sin(i * 91.7 + k * 47.3) * 9871.13;
      return s - Math.floor(s);
    };
    const n = kind === "volume" ? 260 : 9;
    const extra = kind === "scarce" ? 16 : 0;
    const dur = kind === "volume" ? 1900 : 1700;
    const reduce = prefersReducedMotion();
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = reduce || !run ? (run ? 1 : 0) : Math.min(1, (now - t0) / dur);
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const appear = Math.min(1, Math.max(0, (t * 1.6 - (i / n) * 0.6) / 0.4));
        if (appear <= 0) continue;
        const x = 8 + rnd(i, 1) * (W - 16);
        const y = 8 + rnd(i, 2) * (H - 16) + (1 - appear) * -10;
        let a = 0.22 * appear;
        if (kind === "volume") {
          // The reading line passes left to right in the second half.
          const scan = Math.min(1, Math.max(0, (t - 0.45) / 0.5)) * (W + 20) - 10;
          if (x < scan) a = 0.6;
        } else a = 0.85 * appear;
        g.globalAlpha = a;
        g.fillStyle = "#0A0C0F";
        g.beginPath();
        g.arc(x, y, kind === "volume" ? 1.8 : 4.5, 0, Math.PI * 2);
        g.fill();
      }
      if (kind === "volume") {
        const scan = Math.min(1, Math.max(0, (t - 0.45) / 0.5)) * (W + 20) - 10;
        if (t > 0.45 && t < 1) {
          g.globalAlpha = 0.35;
          g.fillRect(scan, 0, 1, H);
        }
      }
      for (let k = 0; k < extra; k++) {
        const tk = easeOut(Math.min(1, Math.max(0, (t - 0.35 - k * 0.025) / 0.45)));
        if (tk <= 0) continue;
        const tx = 8 + rnd(k + 50, 1) * (W - 16);
        const ty = 8 + rnd(k + 50, 2) * (H - 16);
        const x = W + 20 + (tx - W - 20) * tk;
        const y = ty + (1 - tk) * (rnd(k, 3) - 0.5) * 60;
        g.globalAlpha = 0.9 * tk;
        g.strokeStyle = "#1B4DFF";
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (t < 1 && run && !reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, run]);
  return <canvas ref={ref} aria-hidden="true" className="mt-8 block h-28 w-full" />;
}

function Count({ to, run, ms }: { to: number; run: boolean; ms: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (prefersReducedMotion()) return;
    if (!run) {
      el.textContent = "0";
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      el.textContent = fmt.format(Math.round(easeOut(t) * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to, ms]);
  // Server HTML carries the final value, so the page is complete without JS.
  return <span ref={ref}>{fmt.format(to)}</span>;
}

const TILES = [
  { kind: "volume" as const, n: 2000, k: "Volume role", line: "applications for a support role in Bengaluru.", act: "We read every one." },
  { kind: "scarce" as const, n: 9, k: "Scarce role", line: "applications for a battery storage engineer.", act: "So we go and find the rest." },
];

export default function VolumeScarce() {
  const ref = useRef<HTMLDivElement>(null);
  const run = useOnceInView(ref, 0.3);
  return (
    <div ref={ref} className="mt-14 grid gap-4 md:grid-cols-2 md:gap-5">
      {TILES.map((t) => (
        <div key={t.k} className="rounded-[28px] bg-paper p-8 sm:p-10">
          <span className="label">{t.k}</span>
          <p className="mt-8 font-mono text-[clamp(3rem,7vw,5.5rem)] font-medium leading-none tracking-[-0.08em] tabular-nums text-ink">
            <Count to={t.n} run={run} ms={t.kind === "volume" ? 1200 : 600} />
          </p>
          <p className="mt-4 max-w-[22rem] text-[1.125rem] leading-snug text-slate">{t.line}</p>
          <p className="mt-2 text-[1.125rem] font-medium leading-snug text-ink">{t.act}</p>
          <Strip kind={t.kind} run={run} />
        </div>
      ))}
    </div>
  );
}
