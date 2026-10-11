import { createNoise2D, mulberry32 } from "./noise";

/**
 * The winnow particle field. Everything that can be decided ahead of time is
 * decided in createField(); renderField() only interpolates from scroll
 * progress (0..1) and a clock.
 */

export const KEEP = 10;
export const DISPLAY_TOTAL = 2000;

const INK = [10, 12, 15];
const SIGNAL = [27, 77, 255];

// Elimination schedule (in scroll progress).
const ELIM_START = 0.05;
const ELIM_END = 0.8;
const WAVES = 7;
const FALL = 0.075; // progress a falling dot takes to fade out
// Survivor travel.
const TRAVEL = 0.3;

export type Field = {
  n: number;
  ox: Float32Array; // origin, normalised 0..1
  oy: Float32Array;
  r: Float32Array;
  a: Float32Array; // base alpha
  seed: Float32Array;
  th: Float32Array; // elimination threshold; Infinity for survivors
  fall: Float32Array; // px a dot drops as it is eliminated
  sx: Float32Array; // sideways drift while falling
  keep: Int32Array; // survivor indices, ordered by target slot (left to right)
  start: Float32Array; // per slot: progress at which the survivor sets off
  arc: Float32Array; // per slot: bow of its path, as a fraction of distance
  slotJx: Float32Array; // per slot: loose-row jitter
  slotJy: Float32Array;
  thresholds: Float32Array; // sorted, for the counter
  noise: (x: number, y: number) => number;
};

export function createField(n: number, seedValue = 20260): Field {
  const rand = mulberry32(seedValue);
  const noise = createNoise2D(rand);
  const ox = new Float32Array(n);
  const oy = new Float32Array(n);
  const r = new Float32Array(n);
  const a = new Float32Array(n);
  const seed = new Float32Array(n);
  const th = new Float32Array(n);
  const fall = new Float32Array(n);
  const sx = new Float32Array(n);

  // Organic, cloud-like distribution: rejection-sample against low-frequency noise.
  for (let i = 0; i < n; ) {
    const x = rand();
    const y = rand();
    const density = 0.45 + 0.55 * (0.5 + 0.5 * noise(x * 2.2 + 11, y * 2.2 - 7));
    if (rand() > density) continue;
    ox[i] = x;
    oy[i] = y;
    r[i] = 1.5 + rand();
    a[i] = 0.12 + rand() * 0.06;
    seed[i] = rand();
    fall[i] = 18 + rand() * 46;
    sx[i] = (rand() - 0.5) * 16;
    i++;
  }

  // Survivors: one from each cell of a jittered 5x2 grid so their journeys
  // start from all over the field, never from one clump.
  const keep: number[] = [];
  for (let k = 0; k < KEEP; k++) {
    const cx = ((k % 5) + 0.2 + rand() * 0.6) / 5;
    const cy = (Math.floor(k / 5) + 0.15 + rand() * 0.7) / 2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (keep.includes(i)) continue;
      const d = (ox[i] - cx) ** 2 + (oy[i] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    keep.push(best);
  }
  // Assign slots in origin-x order so paths fan in without crossing.
  keep.sort((p, q) => ox[p] - ox[q]);

  // Elimination thresholds: waves. The wave a dot belongs to mixes a spatial
  // field (so regions clear together) with its own seed (so it never reads as
  // a wipe). Within a wave, thresholds cluster, leaving a pause between waves.
  const span = ELIM_END - ELIM_START;
  for (let i = 0; i < n; i++) {
    if (keep.includes(i)) {
      th[i] = Infinity;
      continue;
    }
    const spatial = 0.5 + 0.5 * noise(ox[i] * 1.6 + 40, oy[i] * 1.6 + 40);
    const mix = Math.min(0.999, Math.max(0, 0.55 * spatial + 0.45 * seed[i]));
    const wave = Math.floor(mix * WAVES);
    th[i] = ELIM_START + ((wave + 0.72 * rand()) / WAVES) * span;
  }

  // Survivors leave in a shuffled order across the middle of the scroll.
  const order = Array.from({ length: KEEP }, (_, k) => k);
  for (let k = KEEP - 1; k > 0; k--) {
    const j = (rand() * (k + 1)) | 0;
    [order[k], order[j]] = [order[j], order[k]];
  }
  const start = new Float32Array(KEEP);
  const arc = new Float32Array(KEEP);
  const slotJx = new Float32Array(KEEP);
  const slotJy = new Float32Array(KEEP);
  order.forEach((slot, rank) => {
    start[slot] = 0.2 + rank * 0.042 + rand() * 0.03;
    arc[slot] = (rand() - 0.5) * 0.35;
    slotJx[slot] = (rand() - 0.5) * 0.5;
    slotJy[slot] = (rand() - 0.5) * 2;
  });

  const thresholds = Float32Array.from(th.filter((t) => Number.isFinite(t))).sort();

  return {
    n,
    ox,
    oy,
    r,
    a,
    seed,
    th,
    fall,
    sx,
    keep: Int32Array.from(keep),
    start,
    arc,
    slotJx,
    slotJy,
    thresholds,
    noise,
  };
}

export type Layout = {
  w: number;
  h: number;
  rowX0: number; // left end of the survivors' row
  rowX1: number;
  rowY: number;
  keepR: number; // survivor radius
};

/** Where the row of ten sits: upper-right quadrant, aligned to the content column. */
export function computeLayout(w: number, h: number): Layout {
  const mobile = w < 640;
  const gutter = mobile ? 20 : 24;
  const right = Math.min(w - gutter, (w + 1180) / 2 - gutter) - 6;
  const width = mobile ? Math.min(w * 0.52, 230) : Math.min(w * 0.3, 420);
  return {
    w,
    h,
    rowX0: right - width,
    rowX1: right,
    rowY: Math.round(h * (mobile ? 0.26 : 0.27)),
    keepR: mobile ? 4.5 : 5,
  };
}

/** Survivors remaining (in display units, 2,000 → 10) at a given progress. */
export function countAt(f: Field, p: number): number {
  // Number of thresholds strictly greater than p - FALL/2 (a dot counts as gone mid-fall).
  const cut = p - FALL * 0.5;
  let lo = 0;
  let hi = f.thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (f.thresholds[mid] <= cut) lo = mid + 1;
    else hi = mid;
  }
  const alive = f.thresholds.length - lo;
  return Math.round(KEEP + (alive / f.thresholds.length) * (DISPLAY_TOTAL - KEEP));
}

export function makeSprite(rgb: number[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const s = 64;
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  g.fill();
  return c;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Under-damped spring step response, normalised to land at exactly 1.
const ZETA = 0.82;
const OMEGA = 7.2;
const WD = OMEGA * Math.sqrt(1 - ZETA * ZETA);
function spring(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const env = Math.exp(-ZETA * OMEGA * t);
  return 1 - env * (Math.cos(WD * t) + ((ZETA * OMEGA) / WD) * Math.sin(WD * t));
}

export type Sprites = { ink: HTMLCanvasElement; signal: HTMLCanvasElement };

export function renderField(
  ctx: CanvasRenderingContext2D,
  f: Field,
  L: Layout,
  p: number,
  time: number, // seconds
  drift: number, // px amplitude, 0 to disable
  sprites: Sprites,
) {
  const { w, h } = L;
  ctx.clearRect(0, 0, w, h);
  const { ox, oy, r, a, th, fall, sx, noise } = f;
  const tt = time * 0.035;
  // As the field thins, the dots still under consideration darken slightly.
  const presence = 1 + 0.7 * smooth(0.1, ELIM_END, p);

  for (let i = 0; i < f.n; i++) {
    const t = th[i];
    if (t === Infinity) continue; // survivors drawn last, on top
    const d = (p - t) / FALL;
    if (d >= 1) continue;
    let x = ox[i] * w;
    let y = oy[i] * h;
    if (drift) {
      x += drift * noise(ox[i] * 3 + tt, oy[i] * 3);
      y += drift * noise(ox[i] * 3 + 31.7, oy[i] * 3 - tt);
    }
    let alpha = a[i] * presence;
    let rad = r[i];
    if (d > 0) {
      const e = d * d;
      y += e * fall[i];
      x += e * sx[i];
      alpha *= (1 - d) * (1 - d);
      rad *= 1 - 0.35 * d;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.ink, x - rad, y - rad, rad * 2, rad * 2);
  }

  const span = L.rowX1 - L.rowX0;
  const step = span / (KEEP - 1);
  for (let k = 0; k < KEEP; k++) {
    const i = f.keep[k];
    const tx = L.rowX0 + k * step + (k > 0 && k < KEEP - 1 ? f.slotJx[k] * step : 0);
    const ty = L.rowY + f.slotJy[k] * 5;
    const x0 = ox[i] * w;
    const y0 = oy[i] * h;
    const t = clamp01((p - f.start[k]) / TRAVEL);
    const e = spring(t);
    const dx = tx - x0;
    const dy = ty - y0;
    const bow = Math.sin(Math.PI * Math.min(t, 1)) * f.arc[k];
    let x = x0 + dx * e - dy * bow;
    let y = y0 + dy * e + dx * bow;
    if (drift) {
      // Drift fades as the survivor settles; a breath of it remains.
      const amp = drift * (1 - 0.85 * smooth(0, 0.9, t));
      x += amp * noise(ox[i] * 3 + tt, oy[i] * 3);
      y += amp * noise(ox[i] * 3 + 31.7, oy[i] * 3 - tt);
    }
    const c = smooth(0.02, 0.5, t);
    const rad = r[i] + (L.keepR - r[i]) * smooth(0.05, 0.75, t);
    const alpha = a[i] * presence + (1 - a[i] * presence) * c;
    if (c < 1) {
      ctx.globalAlpha = alpha * (1 - c);
      ctx.drawImage(sprites.ink, x - rad, y - rad, rad * 2, rad * 2);
    }
    if (c > 0) {
      ctx.globalAlpha = alpha * c;
      ctx.drawImage(sprites.signal, x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalAlpha = 1;
}

export { INK, SIGNAL };
