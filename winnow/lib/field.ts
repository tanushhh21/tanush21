import { createNoise2D, mulberry32 } from "./noise";

/**
 * The hero field, in three acts.
 *
 *   Source     On load (clock-driven), candidates stream into the field from
 *              the channels they were found on.
 *   Evaluate   On scroll, a reading line sweeps the field. Every dot is read
 *              as it passes; most fall away, a few stay under consideration.
 *              A second, deeper read narrows those down.
 *   Shortlist  Ten remain. They turn signal and spring into a loose row.
 *
 * Everything that can be decided ahead of time is decided in createField();
 * renderField() only interpolates from scroll progress and a clock.
 */

export const KEEP = 10;
export const DISPLAY_TOTAL = 2140;

export const CHANNELS = ["LinkedIn", "GitHub", "Naukri", "Referrals", "Alumni networks", "Inbound"];
const CHANNEL_WEIGHT = [0.3, 0.13, 0.24, 0.1, 0.08, 0.15];

export const INK = [10, 12, 15];
export const SIGNAL = [27, 77, 255];

// Act 1, in seconds after the field becomes visible. Phones get a quicker act.
const SOURCE_SPREAD = 2.4; // window over which candidates set off
const SOURCE_TRAVEL = 1.25; // seconds each takes to arrive
export const SOURCE_TOTAL = SOURCE_SPREAD + SOURCE_TRAVEL;
const PHONE_SPEED = 1.6; // phones run act 1 this much faster

// Acts 2 and 3, in scroll progress (0..1).
export const SCAN_START = 0.06;
export const SCAN_END = 0.54;
const READ_FLASH = 0.022; // how long a dot stays highlighted as it is read
const FALL = 0.06; // how long an eliminated dot takes to fall away
const DEEP_START = 0.56;
const DEEP_END = 0.78;
const TRAVEL = 0.2; // survivor travel to the row
const CONSIDER_SHARE = 0.055; // share of the field that survives the first read

export type Field = {
  n: number;
  ox: Float32Array; // home, normalised 0..1
  oy: Float32Array;
  r: Float32Array;
  a: Float32Array; // base alpha
  ch: Uint8Array; // channel each was sourced from
  depart: Float32Array; // seconds: when it leaves its channel
  bend: Float32Array; // sideways bend of its sourcing path, px
  read: Float32Array; // progress at which the reading line reaches it
  out: Float32Array; // progress at which it starts to fall; Infinity if kept
  fall: Float32Array; // px it drops as it falls
  sx: Float32Array;
  considered: Uint8Array; // 1 if it survives the first read
  kept: Uint8Array; // 1 for the ten
  keep: Int32Array; // the ten, ordered by row slot (left to right)
  start: Float32Array; // per slot: progress at which it sets off for the row
  arc: Float32Array;
  slotJx: Float32Array;
  slotJy: Float32Array;
  departSorted: Float32Array; // for the Sourced counter
  readSorted: Float32Array; // for the Read counter
  travel: number; // seconds each dot takes to arrive
  sourceTotal: number; // seconds until the last has arrived
  noise: (x: number, y: number) => number;
};

export function createField(n: number, quick = false, seedValue = 21400): Field {
  const rand = mulberry32(seedValue);
  const noise = createNoise2D(rand);
  const ox = new Float32Array(n);
  const oy = new Float32Array(n);
  const r = new Float32Array(n);
  const a = new Float32Array(n);
  const ch = new Uint8Array(n);
  const depart = new Float32Array(n);
  const bend = new Float32Array(n);
  const read = new Float32Array(n);
  const out = new Float32Array(n);
  const fall = new Float32Array(n);
  const sx = new Float32Array(n);
  const considered = new Uint8Array(n);

  const cum = CHANNEL_WEIGHT.map((_, i) => CHANNEL_WEIGHT.slice(0, i + 1).reduce((s, v) => s + v, 0));

  // Homes: cloud-like, by rejection-sampling against low-frequency noise.
  // The band right under the channel labels stays clear so the streams read.
  for (let i = 0; i < n; ) {
    const x = rand();
    const y = 0.21 + rand() * 0.79;
    const density = 0.45 + 0.55 * (0.5 + 0.5 * noise(x * 2.2 + 11, y * 2.2 - 7));
    if (rand() > density) continue;
    ox[i] = x;
    oy[i] = y;
    r[i] = 1.4 + rand() * 1.1;
    a[i] = 0.13 + rand() * 0.07;
    const c = rand();
    ch[i] = cum.findIndex((v) => c <= v + 1e-9);
    // Early arrivals bunch up a little, so the field fills quickly then settles.
    depart[i] = (Math.pow(rand(), 1.35) * SOURCE_SPREAD) / (quick ? PHONE_SPEED : 1);
    bend[i] = (rand() - 0.5) * 120;
    read[i] = SCAN_START + ((x + 0.03) / 1.06) * (SCAN_END - SCAN_START);
    fall[i] = 16 + rand() * 40;
    sx[i] = (rand() - 0.5) * 14;
    i++;
  }

  // The ten: one from each cell of a jittered 5x2 grid over the field.
  const keep: number[] = [];
  for (let k = 0; k < KEEP; k++) {
    const cx = ((k % 5) + 0.2 + rand() * 0.6) / 5;
    const cy = 0.2 + ((Math.floor(k / 5) + 0.15 + rand() * 0.7) / 2) * 0.78;
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
  keep.sort((p, q) => ox[p] - ox[q]);
  const isKept = new Uint8Array(n);
  keep.forEach((i) => (isKept[i] = 1));

  // First read: most fall shortly after the line passes them. Second read:
  // those still under consideration fall one by one until ten remain.
  for (let i = 0; i < n; i++) {
    if (isKept[i]) {
      considered[i] = 1;
      out[i] = Infinity;
    } else if (rand() < CONSIDER_SHARE) {
      considered[i] = 1;
      out[i] = DEEP_START + rand() * (DEEP_END - DEEP_START);
    } else {
      out[i] = read[i] + 0.008 + rand() * 0.05;
    }
  }

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
    start[slot] = 0.6 + rank * 0.018 + rand() * 0.012;
    arc[slot] = (rand() - 0.5) * 0.35;
    slotJx[slot] = (rand() - 0.5) * 0.5;
    slotJy[slot] = (rand() - 0.5) * 2;
  });

  return {
    n, ox, oy, r, a, ch, depart, bend, read, out, fall, sx, considered,
    kept: isKept,
    keep: Int32Array.from(keep),
    start, arc, slotJx, slotJy,
    departSorted: Float32Array.from(depart).sort(),
    readSorted: Float32Array.from(read).sort(),
    travel: SOURCE_TRAVEL / (quick ? PHONE_SPEED : 1),
    sourceTotal: SOURCE_TOTAL / (quick ? PHONE_SPEED : 1),
    noise,
  };
}

export type Layout = {
  w: number;
  h: number;
  mobile: boolean;
  channels: { x: number; y: number }[]; // label anchors (centre of the text)
  rowX0: number;
  rowX1: number;
  rowY: number;
  keepR: number;
};

/** Channel labels across the top of the content column; the row of ten in the upper right. */
export function computeLayout(w: number, h: number): Layout {
  const mobile = w < 640;
  const gutter = mobile ? 20 : 24;
  const left = Math.max(gutter, (w - 1180) / 2 + gutter);
  const right = Math.min(w - gutter, (w + 1180) / 2 - gutter);
  const span = right - left;
  const top = mobile ? 92 : Math.max(104, h * 0.13);
  const channels = CHANNELS.map((_, i) => {
    if (mobile) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return { x: left + (span * (col + 0.5)) / 3, y: top + row * 40 };
    }
    return { x: left + (span * (i + 0.5)) / CHANNELS.length, y: top };
  });
  const width = mobile ? Math.min(w * 0.56, 240) : Math.min(w * 0.3, 420);
  return {
    w,
    h,
    mobile,
    channels,
    rowX0: right - width,
    rowX1: right,
    rowY: Math.round(h * (mobile ? 0.29 : 0.31)),
    keepR: mobile ? 4.5 : 5,
  };
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

export type Counts = { sourced: number; read: number; shortlisted: number };

export function countsAt(f: Field, sourceT: number, p: number): Counts {
  const arrived = countBelow(f.departSorted, sourceT - f.travel * 0.6);
  const read = countBelow(f.readSorted, p);
  let shortlisted = 0;
  for (let k = 0; k < KEEP; k++) if (p >= f.start[k] + TRAVEL * 0.7) shortlisted++;
  return {
    sourced: Math.round((arrived / f.n) * DISPLAY_TOTAL),
    read: Math.round((read / f.n) * DISPLAY_TOTAL),
    shortlisted,
  };
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

const fmtIN = new Intl.NumberFormat("en-IN");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Where a dot is on its way in from channel c to home (hx, hy) at eased time e:
 * straight down out of the label as a narrow stream, then fanning out.
 */
function streamPoint(c: { x: number; y: number }, bend: number, hx: number, hy: number, e: number) {
  const x0 = c.x + bend * 0.04;
  const y0 = c.y + 22;
  const x1 = c.x + bend * 0.12;
  const y1 = y0 + (hy - y0) * 0.55;
  const x2 = hx;
  const y2 = y0 + (hy - y0) * 0.7;
  const m = 1 - e;
  const a = m * m * m;
  const b = 3 * m * m * e;
  const d = 3 * m * e * e;
  const g = e * e * e;
  return [a * x0 + b * x1 + d * x2 + g * hx, a * y0 + b * y1 + d * y2 + g * hy];
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
export type Frame = {
  p: number; // scroll progress
  sourceT: number; // seconds into act 1
  time: number; // seconds, for drift
  drift: number; // px amplitude; 0 disables
  mono: string; // font-family for canvas labels
};

export function renderField(ctx: CanvasRenderingContext2D, f: Field, L: Layout, F: Frame, sprites: Sprites) {
  const { w, h } = L;
  const { p, sourceT, drift } = F;
  ctx.clearRect(0, 0, w, h);
  const { ox, oy, r, a, noise } = f;
  const tt = F.time * 0.035;

  const perChannel = new Array(CHANNELS.length).fill(0);

  // The reading line.
  const scanX = ((p - SCAN_START) / (SCAN_END - SCAN_START)) * 1.06 * w - 0.03 * w;
  const scanOn = smooth(SCAN_START, SCAN_START + 0.03, p) * (1 - smooth(SCAN_END - 0.03, SCAN_END, p));
  if (scanOn > 0.01) {
    ctx.globalAlpha = 0.28 * scanOn;
    ctx.fillStyle = "rgb(10 12 15)";
    ctx.fillRect(Math.round(scanX), h * 0.1, 1, h * 0.9);
  }

  const span = L.rowX1 - L.rowX0;
  const step = span / (KEEP - 1);

  for (let i = 0; i < f.n; i++) {
    // Act 1: has it arrived yet?
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0) continue;
    if (u > 0.6) perChannel[f.ch[i]]++;
    const d = (p - f.out[i]) / FALL;
    if (d >= 1) continue;
    if (f.kept[i]) continue; // the ten are drawn last, on top

    let hx = ox[i] * w;
    let hy = oy[i] * h;
    if (drift) {
      hx += drift * noise(ox[i] * 3 + tt, oy[i] * 3);
      hy += drift * noise(ox[i] * 3 + 31.7, oy[i] * 3 - tt);
    }
    let x = hx;
    let y = hy;
    let alpha = a[i];
    let rad = r[i];
    if (u < 1) {
      const e = easeOutCubic(u);
      [x, y] = streamPoint(L.channels[f.ch[i]], f.bend[i], hx, hy, e);
      // In flight they are darker, so each channel reads as a stream.
      alpha = Math.min(1, a[i] + (0.5 - a[i]) * (1 - e) * smooth(0, 0.08, u));
      rad *= 0.85 + 0.15 * e;
    }
    // Act 2: read as the line passes.
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

  // Act 3: the ten.
  for (let k = 0; k < KEEP; k++) {
    const i = f.keep[k];
    const u = clamp01((sourceT - f.depart[i]) / f.travel);
    if (u <= 0) continue;
    const tx = L.rowX0 + k * step + (k > 0 && k < KEEP - 1 ? f.slotJx[k] * step : 0);
    const ty = L.rowY + f.slotJy[k] * 5;
    let x0 = ox[i] * w;
    let y0 = oy[i] * h;
    let alpha0 = a[i];
    let r0 = r[i];
    if (u < 1) {
      const e = easeOutCubic(u);
      [x0, y0] = streamPoint(L.channels[f.ch[i]], f.bend[i], x0, y0, e);
      alpha0 = Math.min(1, a[i] + (0.5 - a[i]) * (1 - e) * smooth(0, 0.08, u));
    }
    const flash = clamp01(1 - Math.abs(p - f.read[i]) / READ_FLASH);
    alpha0 += 0.5 * flash;
    if (p > f.read[i]) {
      const c = smooth(f.read[i], f.read[i] + 0.03, p);
      alpha0 += (0.42 - a[i]) * c;
      r0 += 0.6 * c;
    }
    const t = clamp01((p - f.start[k]) / TRAVEL);
    const e = spring(t);
    const dx = tx - x0;
    const dy = ty - y0;
    const bow = Math.sin(Math.PI * t) * f.arc[k];
    let x = x0 + dx * e - dy * bow;
    let y = y0 + dy * e + dx * bow;
    if (drift) {
      const amp = drift * (1 - 0.85 * smooth(0, 0.9, t));
      x += amp * noise(ox[i] * 3 + tt, oy[i] * 3);
      y += amp * noise(ox[i] * 3 + 31.7, oy[i] * 3 - tt);
    }
    // They turn signal as the deeper read singles them out, before they move.
    const c = smooth(f.start[k] - 0.05, f.start[k] + 0.04, p);
    const rad = r0 + (L.keepR - r0) * smooth(0.05, 0.75, t);
    const alpha = Math.min(1, alpha0 + (1 - alpha0) * c);
    if (c < 1) {
      ctx.globalAlpha = alpha * (1 - c);
      ctx.drawImage(sprites.ink, x - rad, y - rad, rad * 2, rad * 2);
    }
    if (c > 0) {
      ctx.globalAlpha = alpha * c;
      ctx.drawImage(sprites.signal, x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // Channel labels, each with how many it has yielded so far. Present while
  // candidates arrive; gone once reading starts.
  const labelAlpha = 1 - smooth(0.02, SCAN_START + 0.04, p);
  if (labelAlpha > 0.01) {
    const size = L.mobile ? 9.5 : 10.5;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "1.4px";
    L.channels.forEach((c, i) => {
      ctx.globalAlpha = labelAlpha * smooth(0, 0.5, sourceT - i * 0.08);
      ctx.font = `500 ${size}px ${F.mono}`;
      ctx.fillStyle = "rgb(107 114 128)";
      ctx.fillText(CHANNELS[i].toUpperCase(), c.x, c.y);
      ctx.font = `400 ${size + 1}px ${F.mono}`;
      ctx.fillStyle = "rgb(10 12 15)";
      ctx.fillText(fmtIN.format(Math.round((perChannel[i] / f.n) * DISPLAY_TOTAL)), c.x, c.y + 15);
    });
  }
  ctx.globalAlpha = 1;
}

/** Whether act 1 still has dots in flight at this clock. */
export const sourcingDone = (f: Field, sourceT: number) => sourceT >= f.sourceTotal;
