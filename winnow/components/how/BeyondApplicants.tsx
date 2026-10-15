"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./useOnceInView";

/**
 * Most of the right people never apply. A small pool of applicants sits in
 * a wider market; a search sweeps outward, the right-fit candidates light up
 * wherever they are, and they gather into a shortlist. Loops while visible.
 */

const LOOP = 7600; // ms
const N_APPLIED = 34;
const N_MARKET = 230;

type P = { x: number; y: number; r: number; fit: boolean; applied: boolean; seed: number };

function makePoints(): P[] {
  const rnd = (i: number, k: number) => {
    const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const pts: P[] = [];
  // Applicants: inside a small circle on the left (normalised units).
  for (let i = 0; i < N_APPLIED; i++) {
    const a = rnd(i, 1) * Math.PI * 2;
    const d = Math.sqrt(rnd(i, 2)) * 0.13;
    pts.push({ x: 0.22 + Math.cos(a) * d * 0.62, y: 0.5 + Math.sin(a) * d, r: 2.6, fit: i % 17 === 3, applied: true, seed: rnd(i, 3) });
  }
  // The wider market: everywhere else.
  for (let i = 0, k = 0; i < N_MARKET; k++) {
    const x = 0.04 + rnd(k + 99, 1) * 0.68;
    const y = 0.08 + rnd(k + 99, 2) * 0.84;
    if (Math.hypot((x - 0.22) / 0.62, y - 0.5) < 0.15) continue; // keep clear of the applicant pool
    pts.push({ x, y, r: 2.2, fit: false, applied: false, seed: rnd(k, 3) });
    i++;
  }
  // The right fits: mostly out in the market.
  const fitIdx = [40, 71, 96, 120, 151, 177, 202, 231, 250];
  fitIdx.forEach((k) => (pts[k].fit = true));
  return pts;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export default function BeyondApplicants() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const pts = makePoints();
    const fits = pts.filter((p) => p.fit);
    const reduce = prefersReducedMotion();
    let W = 0;
    let H = 0;
    let raf = 0;
    let visible = false;
    let base = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = c.getBoundingClientRect();
      W = r.width;
      H = r.height;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(reduce ? LOOP * 0.7 : (performance.now() - base) % LOOP);
    };

    const draw = (ms: number) => {
      const u = ms / LOOP;
      g.clearRect(0, 0, W, H);
      // On narrow screens the market spans the full width and the shortlist
      // becomes a row underneath it.
      const narrow = W < 560;
      const sx = (x: number) => (narrow ? ((x - 0.04) / 0.68) * 0.92 + 0.04 : x) * W;
      const sy = (y: number) => (narrow ? y * 0.74 : y) * H;
      const cx = sx(0.22);
      const cy = sy(0.5);
      const sweep = smooth(0.08, 0.48, u) * Math.hypot(W, H) * 0.85; // search radius
      const gather = smooth(0.5, 0.7, u); // right fits move to the shortlist
      const reset = smooth(0.9, 1, u); // fade back for the next loop
      const breathe = (s: number) => Math.sin((ms / 1000) * 1.3 + s * 6.28) * 1.2;

      // The applicant pool.
      g.globalAlpha = 1 - reset * 0.5;
      g.strokeStyle = "#E8EAED";
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, Math.abs(sx(0.22 + 0.13 * 0.62) - cx) + 10, Math.abs(sy(0.5 + 0.13) - cy) + 10, 0, 0, Math.PI * 2);
      g.stroke();

      // The search sweeping outward from the applicants.
      if (sweep > 0 && u < 0.52) {
        g.globalAlpha = 0.5 * (1 - smooth(0.4, 0.52, u));
        g.strokeStyle = "#0A0C0F";
        g.beginPath();
        g.arc(cx, cy, sweep, 0, Math.PI * 2);
        g.stroke();
      }

      // Everyone, with right fits picked out as the sweep reaches them.
      for (const p of pts) {
        const px = sx(p.x);
        const py = sy(p.y) + breathe(p.seed);
        const reached = Math.hypot(px - cx, py - cy) < sweep;
        if (p.fit) continue;
        g.globalAlpha = (p.applied ? 0.55 : reached ? 0.28 : 0.16) * (1 - reset * 0.3);
        g.fillStyle = "#0A0C0F";
        g.beginPath();
        g.arc(px, py, p.r, 0, Math.PI * 2);
        g.fill();
      }

      // The shortlist: a column on the right, or a row underneath on phones.
      const slot = (k: number) =>
        narrow
          ? { x: W / 2 + (k - (fits.length - 1) / 2) * Math.min(26, (W - 40) / fits.length), y: H * 0.9 }
          : { x: sx(0.84), y: sy(0.5) + (k - (fits.length - 1) / 2) * 22 };
      if (!narrow) {
        g.globalAlpha = smooth(0.5, 0.62, u) * (1 - reset);
        g.strokeStyle = "#E8EAED";
        g.lineWidth = 6;
        g.lineCap = "round";
        fits.forEach((_, k) => {
          const s = slot(k);
          g.beginPath();
          g.moveTo(s.x + 16, s.y);
          g.lineTo(s.x + 16 + 70 - k * 4, s.y);
          g.stroke();
        });
      }

      fits.forEach((p, k) => {
        const px = sx(p.x);
        const py = sy(p.y) + breathe(p.seed);
        const found = Math.hypot(px - cx, py - cy) < sweep || u >= 0.5;
        const e = smooth(0, 1, clamp01((gather - k * 0.04) / 0.8));
        const s = slot(k);
        const x = px + (s.x - px) * e;
        const y = py + (s.y - py) * e;
        const pulse = found && u < 0.5 ? Math.max(0, 1 - ((ms / 1000) * 1.5 + p.seed) % 1) : 0;
        g.globalAlpha = (found ? 1 : 0.16) * (1 - reset);
        g.fillStyle = found ? "#1B4DFF" : "#0A0C0F";
        g.beginPath();
        g.arc(x, y, found ? 4.5 : 2.2, 0, Math.PI * 2);
        g.fill();
        if (pulse > 0) {
          g.globalAlpha = 0.5 * pulse * (1 - reset);
          g.strokeStyle = "#1B4DFF";
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(x, y, 4.5 + (1 - pulse) * 10, 0, Math.PI * 2);
          g.stroke();
        }
      });
      g.globalAlpha = 1;
    };

    const tick = (now: number) => {
      draw((now - base) % LOOP);
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !reduce;
      if (visible && !raf) {
        base = performance.now();
        raf = requestAnimationFrame(tick);
      }
    });
    io.observe(c);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="mt-14 overflow-hidden rounded-[28px] bg-paper p-5 sm:p-8">
      <canvas ref={ref} aria-hidden="true" className="block h-[19rem] w-full sm:h-[22rem]" />
      <ul className="mt-5 flex flex-wrap justify-center gap-x-7 gap-y-2 text-[14px] text-slate">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink/60" /> Your applicants
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink/20" /> The wider market
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" /> The right fit
        </li>
      </ul>
    </div>
  );
}
