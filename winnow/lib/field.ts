import { createNoise2D, mulberry32 } from "./noise";

/**
 * The hero, as one particle system telling the whole story.
 *
 *   Find       On load (clock-driven), candidates fly in from every direction
 *              and assemble the wordmark: winnow.
 *   Read       On scroll, the word dissolves into a field. A reading line
 *              sweeps it; every dot is read as the line passes and most fall
 *              away. A second, deeper read narrows the rest.
 *   Hire       Ten remain. They turn signal and fly into the Winnow mark: ten
 *              dots narrowing to one. Nine settle to ink; one stays signal.
 *
 * Everything that can be decided ahead of time is decided in createField()
 * and placeField(); renderField() only interpolates from scroll progress and
 * a clock.
 */

export const KEEP = 10;

export const INK = [10, 12, 15];
export const SIGNAL = [27, 77, 255];

// Find (seconds after the field starts). Phones run it faster.
const SOURCE_SPREAD = 2.2;
const SOURCE_TRAVEL = 1.2;
const PHONE_SPEED = 1.5;

// Read and Hire (scroll progress 0..1).
export const P = {
  dissolveFrom: 0.03,
  dissolveTo: 0.2,
  scanFrom: 0.2,
  scanTo: 0.54,
  deepFrom: 0.56,
  deepTo: 0.72,
  tenFrom: 0.7, // the first of the ten sets off for the mark
  tenTravel: 0.12,
  settleFrom: 0.9, // nine of the ten settle to ink
  settleTo: 0.96,
};
const DISSOLVE = 0.07; // each dot's own dissolve
const READ_FLASH = 0.02;
const FALL = 0.055;
const CONSIDER_SHARE = 0.055;

export type Field = {
  n: number;
  ox: Float32Array; // field home, normalised 0..1
  oy: Float32Array;
  wx: Float32Array; // place in the wordmark, px (set by placeField)
  wy: Float32Array;
  r: Float32Array;
  a: Float32Array; // alpha in the field
  wa: Float32Array; // alpha in the word
  ang: Float32Array; // direction it flies in from
  depart: Float32Array;
  bend: Float32Array;
  dissolve: Float32Array; // progress at which it leaves the word
  read: Float32Array;
  out: Float32Array; // progress at which it falls; Infinity for the ten
  fall: Float32Array;
  sx: Float32Array;
  considered: Uint8Array;
  kept: Uint8Array;
  keep: Int32Array; // the ten, in mark-slot order
  start: Float32Array;
  arc: Float32Array;
  travel: number;
  sourceTotal: number;
  departSorted: Float32Array;
  readSorted: Float32Array;
  noise: (x: number, y: number) => number;
};

export function createField(n: number, quick = false, seedValue = 21400): Field {
  const rand = mulberry32(seedValue);
  const noise = createNoise2D(rand);
  const f32 = () => new Float32Array(n);
  const ox = f32(), oy = f32(), r = f32(), a = f32(), wa = f32();
  const depart = f32(), bend = f32(), dissolve = f32(), read = f32(), out = f32();
  const fall = f32(), sx = f32();
  const ang = f32();
  const considered = new Uint8Array(n);
  const speed = quick ? PHONE_SPEED : 1;

  for (let i = 0; i < n; ) {
    const x = rand();
    const y = 0.08 + rand() * 0.92;
    const density = 0.45 + 0.55 * (0.5 + 0.5 * noise(x * 2.2 + 11, y * 2.2 - 7));
    if (rand() > density) continue;
    ox[i] = x;
    oy[i] = y;
    r[i] = 1.35 + rand() * 1.05;
    a[i] = 0.13 + rand() * 0.07;
    wa[i] = 0.62 + rand() * 0.3;
    ang[i] = rand() * Math.PI * 2;
    depart[i] = (Math.pow(rand(), 1.3) * SOURCE_SPREAD) / speed;
    bend[i] = (rand() - 0.5) * 120;
    dissolve[i] = P.dissolveFrom + rand() * (P.dissolveTo - DISSOLVE - P.dissolveFrom);
    read[i] = P.scanFrom + ((x + 0.03) / 1.06) * (P.scanTo - P.scanFrom);
    fall[i] = 16 + rand() * 40;
    sx[i] = (rand() - 0.5) * 14;
    i++;
  }

  // The ten: one from each cell of a jittered 5x2 grid, so they converge on
  // the mark from all over the field.
  const keep: number[] = [];
  for (let k = 0; k < KEEP; k++) {
    const cx = ((k % 5) + 0.2 + rand() * 0.6) / 5;
    const cy = 0.15 + ((Math.floor(k / 5) + 0.15 + rand() * 0.7) / 2) * 0.8;
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
  // Mark slots run top row left-to-right, then down; pairing by height then x
  // keeps paths from crossing.
  keep.sort((p, q) => oy[p] - oy[q]);
  const rows = [keep.slice(0, 4), keep.slice(4, 7), keep.slice(7, 9), keep.slice(9)];
  const ordered = rows.flatMap((row) => row.sort((p, q) => ox[p] - ox[q]));
  const kept = new Uint8Array(n);
  ordered.forEach((i) => (kept[i] = 1));

  for (let i = 0; i < n; i++) {
    if (kept[i]) {
      considered[i] = 1;
      out[i] = Infinity;
    } else if (rand() < CONSIDER_SHARE) {
      considered[i] = 1;
      out[i] = P.deepFrom + rand() * (P.deepTo - P.deepFrom);
    } else {
      out[i] = read[i] + 0.006 + rand() * 0.045;
    }
  }

  const start = new Float32Array(KEEP);
  const arc = new Float32Array(KEEP);
  const order = Array.from({ length: KEEP }, (_, k) => k);
  for (let k = KEEP - 1; k > 0; k--) {
    const j = (rand() * (k + 1)) | 0;
    [order[k], order[j]] = [order[j], order[k]];
  }
  order.forEach((slot, rank) => {
    start[slot] = P.tenFrom + rank * 0.009 + rand() * 0.006;
    arc[slot] = (rand() - 0.5) * 0.35;
  });

  return {
    n, ox, oy, r, a, wa, ang, depart, bend, dissolve, read, out, fall, sx, considered, kept,
    wx: f32(),
    wy: f32(),
    keep: Int32Array.from(ordered),
    start,
    arc,
    travel: SOURCE_TRAVEL / speed,
    sourceTotal: (SOURCE_SPREAD + SOURCE_TRAVEL) / speed,
    departSorted: Float32Array.from(depart).sort(),
    readSorted: Float32Array.from(read).sort(),
    noise,
  };
}

export type Layout = {
  w: number;
  h: number;
  mobile: boolean;
  word: { cx: number; cy: number; width: number }; // the wordmark's box
  mark: { x: number; y: number }[]; // the ten slots of the Winnow mark
  markR: number;
};

/** Slots of the Winnow mark: rows of 4, 3, 2 and 1, narrowing downwards. */
export function markSlots(cx: number, cy: number, s: number) {
  const pts: { x: number; y: number }[] = [];
  const rowH = s * 0.866;
  [4, 3, 2, 1].forEach((count, row) => {
    for (let k = 0; k < count; k++) {
      pts.push({ x: cx + (k - (count - 1) / 2) * s, y: cy + (row - 1.5) * rowH });
    }
  });
  return pts;
}

export function computeLayout(
  w: number,
  h: number,
  word: { cx: number; cy: number; width: number },
  lockup: { x: number; y: number; s: number },
): Layout {
  const mobile = w < 640;
  return {
    w,
    h,
    mobile,
    word,
    mark: markSlots(lockup.x, lockup.y, lockup.s),
    markR: mobile ? 5.5 : 8,
  };
}

/**
 * Sample the wordmark into one target point per dot. Draws the word offscreen
 * at the layout's size, collects inked pixels on a fine grid, and deals them
 * out at random so every dot lands somewhere in the letters.
 */
export function placeField(f: Field, L: Layout, family: string, seedValue = 7) {
  const rand = mulberry32(seedValue);
  const c = document.createElement("canvas");
  const g = c.getContext("2d", { willReadFrequently: true })!;
  let size = 200;
  g.font = `700 ${size}px ${family}`;
  size *= L.word.width / g.measureText("winnow").width;
  g.font = `700 ${size}px ${family}`;
  const m = g.measureText("winnow");
  const asc = m.actualBoundingBoxAscent;
  const desc = m.actualBoundingBoxDescent;
  const W = Math.ceil(m.width) + 4;
  const H = Math.ceil(asc + desc) + 4;
  c.width = W;
  c.height = H;
  g.font = `700 ${size}px ${family}`;
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";
  g.fillText("winnow", 2, asc + 2);
  const data = g.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  const step = L.mobile ? 1.5 : 2;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[((y | 0) * W + (x | 0)) * 4 + 3] > 140) pts.push(x, y);
    }
  }
  const count = pts.length / 2;
  const x0 = L.word.cx - W / 2;
  const y0 = L.word.cy - H / 2;
  for (let i = 0; i < f.n; i++) {
    const k = ((rand() * count) | 0) * 2;
    f.wx[i] = x0 + pts[k] + (rand() - 0.5) * step;
    f.wy[i] = y0 + pts[k + 1] + (rand() - 0.5) * step;
  }
}

function countBelow(sorted: Float32Array, v: number) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Flying in from beyond the edge of the stage along a gentle curve. The
 * origin is set by the dot's direction; bend bows the path to one side.
 */
function flyPoint(w: number, h: number, ang: number, bend: number, hx: number, hy: number, e: number) {
  const R = Math.hypot(w, h) / 2 + 40;
  const x0 = w / 2 + Math.cos(ang) * R;
  const y0 = h / 2 + Math.sin(ang) * R;
  const mx = (x0 + hx) / 2 - Math.sin(ang) * bend * 2;
  const my = (y0 + hy) / 2 + Math.cos(ang) * bend * 2;
  const m = 1 - e;
  return [m * m * x0 + 2 * m * e * mx + e * e * hx, m * m * y0 + 2 * m * e * my + e * e * hy];
}

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
export type Frame = { p: number; sourceT: number; time: number; drift: number };

/**
 * While the page sits at the top, a dot that has arrived in the word never
 * moves again. Arrived dots are painted once onto this layer, so each frame of
 * the opening only draws the dots still in flight.
 */
export type Settled = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; done: Uint8Array };

export function makeSettled(f: Field, w: number, h: number, dpr: number): Settled {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, done: new Uint8Array(f.n) };
}

export function renderField(
  ctx: CanvasRenderingContext2D,
  f: Field,
  L: Layout,
  F: Frame,
  sprites: Sprites,
  settled?: Settled,
) {
  const { w, h } = L;
  const { p, sourceT, drift } = F;
  ctx.clearRect(0, 0, w, h);
  const { ox, oy, r, a, noise } = f;
  const tt = F.time * 0.035;

  // The reading line.
  const scanX = ((p - P.scanFrom) / (P.scanTo - P.scanFrom)) * 1.06 * w - 0.03 * w;
  const scanOn = smooth(P.scanFrom, P.scanFrom + 0.02, p) * (1 - smooth(P.scanTo - 0.02, P.scanTo, p));
  if (scanOn > 0.01) {
    ctx.globalAlpha = 0.28 * scanOn;
    ctx.fillStyle = "rgb(10 12 15)";
    ctx.fillRect(Math.round(scanX), h * 0.08, 1, h * 0.92);
  }

  if (settled && p <= P.dissolveFrom) {
    renderOpening(ctx, f, L, F, sprites, settled);
    ctx.globalAlpha = 1;
    return;
  }

  // Where dot i sits right now, before act-specific effects.
  const place = (i: number, u: number): [number, number, number, number] => {
    let hx = ox[i] * w;
    let hy = oy[i] * h;
    if (drift) {
      hx += drift * noise(ox[i] * 3 + tt, oy[i] * 3);
      hy += drift * noise(ox[i] * 3 + 31.7, oy[i] * 3 - tt);
    }
    // In the word, then dissolving out of it into the field.
    const dv = easeInOut(clamp01((p - f.dissolve[i]) / DISSOLVE));
    const wx = f.wx[i];
    const wy = f.wy[i];
    let x = wx + (hx - wx) * dv;
    let y = wy + (hy - wy) * dv;
    let alpha = f.wa[i] + (a[i] - f.wa[i]) * dv;
    if (u < 1) {
      const e = easeOutCubic(u);
      [x, y] = flyPoint(w, h, f.ang[i], f.bend[i], x, y, e);
      alpha *= 0.35 + 0.65 * e;
    }
    return [x, y, alpha, dv];
  };

  for (let i = 0; i < f.n; i++) {
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0) continue;
    if (f.kept[i]) continue; // the ten are drawn last, on top
    const d = (p - f.out[i]) / FALL;
    if (d >= 1) continue;

    let [x, y, alpha] = place(i, u);
    let rad = r[i];
    const flash = clamp01(1 - Math.abs(p - f.read[i]) / READ_FLASH);
    if (flash > 0) {
      alpha += 0.5 * flash;
      rad *= 1 + 0.35 * flash;
    }
    if (f.considered[i] && p > f.read[i]) {
      const c = smooth(f.read[i], f.read[i] + 0.03, p);
      alpha += (0.42 - a[i]) * c;
      rad += 0.6 * c;
    }
    if (d > 0) {
      const e = d * d;
      y += e * f.fall[i];
      x += e * f.sx[i];
      alpha *= (1 - d) * (1 - d);
      rad *= 1 - 0.35 * d;
    }
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(sprites.ink, x - rad, y - rad, rad * 2, rad * 2);
  }

  // The ten, flying into the mark.
  for (let k = 0; k < KEEP; k++) {
    const i = f.keep[k];
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0) continue;
    let [x0, y0, alpha0] = place(i, u);
    let r0 = r[i];
    alpha0 += 0.5 * clamp01(1 - Math.abs(p - f.read[i]) / READ_FLASH);
    if (p > f.read[i]) {
      const c = smooth(f.read[i], f.read[i] + 0.03, p);
      alpha0 += (0.42 - a[i]) * c;
      r0 += 0.6 * c;
    }
    const slot = L.mark[k];
    const t = clamp01((p - f.start[k]) / P.tenTravel);
    const e = spring(t);
    const dx = slot.x - x0;
    const dy = slot.y - y0;
    const bow = Math.sin(Math.PI * t) * f.arc[k];
    const x = x0 + dx * e - dy * bow;
    const y = y0 + dy * e + dx * bow;
    // Signal as the deeper read singles them out; at the very end nine settle
    // to ink and one stays signal: the mark.
    let c = smooth(f.start[k] - 0.04, f.start[k] + 0.03, p);
    if (k < KEEP - 1) c *= 1 - smooth(P.settleFrom, P.settleTo, p);
    const rad = r0 + (L.markR - r0) * smooth(0.05, 0.75, t);
    const alpha = Math.min(1, alpha0 + (1 - alpha0) * smooth(f.start[k] - 0.04, f.start[k] + 0.03, p));
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

/** The opening, word-only: settled dots come from the cache layer. */
function renderOpening(
  ctx: CanvasRenderingContext2D,
  f: Field,
  L: Layout,
  F: Frame,
  sprites: Sprites,
  S: Settled,
) {
  const { sourceT } = F;
  for (let i = 0; i < f.n; i++) {
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0) continue;
    if (u >= 1 && !S.done[i]) {
      S.done[i] = 1;
      const rad = f.r[i];
      S.ctx.globalAlpha = f.wa[i];
      S.ctx.drawImage(sprites.ink, f.wx[i] - rad, f.wy[i] - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(S.canvas, 0, 0, L.w, L.h);
  for (let i = 0; i < f.n; i++) {
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0 || u >= 1) continue;
    const e = easeOutCubic(u);
    const [x, y] = flyPoint(L.w, L.h, f.ang[i], f.bend[i], f.wx[i], f.wy[i], e);
    const rad = f.r[i];
    ctx.globalAlpha = f.wa[i] * (0.35 + 0.65 * e);
    ctx.drawImage(sprites.ink, x - rad, y - rad, rad * 2, rad * 2);
  }
}


export const sourcingDone = (f: Field, sourceT: number) => sourceT >= f.sourceTotal;
