/**
 * The home page's process figure: every dot is a candidate, and one scroll
 * value p (0 to 1) moves them through the three steps. Positions are pure
 * functions of p, so scrubbing backwards replays exactly.
 *
 *   Source    (p 0 to 0.34)  applicants stream in from the left (ink); a sonar
 *             ring reaches into the wider market and pulls in the people who
 *             never applied (signal). The rest of the market stays grey.
 *   Evaluate  (p 0.34 to 0.68)  the pool drops through three filters. Most
 *             dots are deflected and blow away like chaff; ten get through.
 *   Shortlist (p 0.68 to 1)  the ten line up by rank, scores fill, and the
 *             five you pick get their interviews booked.
 *
 * All coordinates are in a unit square; the canvas maps them to pixels.
 */

export const LINES = [0.37, 0.55, 0.73];
export const ROWS = 10;
export const BOOKED = 5;
export const rowY = (i: number) => 0.13 + i * 0.079;
export const COL = { dot: 0.17, bar0: 0.23, bar1: 0.78, glyph: 0.88 };

const N_IN = 54;
const N_OUT = 30;
const N_MKT = 70;
const POOLN = N_IN + N_OUT;
const POOL = { x: 0.42, y: 0.5, r: 0.17 };
const TOP = { x: 0.5, y: 0.13, r: 0.1 };
const BIN = { x: 0.5, y: 0.885, r: 0.045 };
const RING0 = 0.22;
const RING_DUR = 0.42;
const RING_MAX = 0.75;
const FALL = 2.4; // unit heights per unit of the Evaluate phase
const SCORES = [0.95, 0.92, 0.9, 0.87, 0.85, 0.82, 0.8, 0.77, 0.74, 0.71];
const GA = Math.PI * (3 - Math.sqrt(5));

const INK = [10, 12, 15];
const SIGNAL = [27, 77, 255];
const GREY = [195, 200, 207];

type Dot = {
  kind: 0 | 1 | 2; // applied, found (never applied), market (not a match)
  x0: number;
  y0: number;
  t0: number; // applied: when it starts towards the pool; found: when the ring reaches it
  slot: number;
  fate: number; // 1 to 3: stopped at that filter; 4: shortlisted
  drop: number;
  lane: number;
  side: number;
  spread: number;
  rank: number;
  ph: number;
};

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], r: () => number) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const mix = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

function slotPos(slot: number, c: { x: number; y: number; r: number }, n = POOLN) {
  const rr = c.r * Math.sqrt((slot + 0.5) / n);
  const th = slot * GA;
  return { x: c.x + rr * Math.cos(th), y: c.y + rr * Math.sin(th) };
}

function create(): Dot[] {
  const r = rng(11);
  const slots = shuffle([...Array(POOLN).keys()], r);
  const dots: Dot[] = [];
  const base = () => ({ fate: 1, drop: 0, lane: 0.28 + r() * 0.44, side: r() < 0.5 ? -1 : 1, spread: 0.2 + r() * 0.16, rank: -1, ph: r() * 6.283 });
  for (let i = 0; i < N_IN; i++) {
    dots.push({ kind: 0, x0: -0.05, y0: 0.22 + r() * 0.56, t0: (i / N_IN) * 0.55 + r() * 0.03, slot: slots[i], ...base() });
  }
  const market = () => ({ x: 0.62 + r() * 0.35, y: 0.08 + r() * 0.86 });
  for (let i = 0; i < N_OUT; i++) {
    const m = market();
    const dist = Math.hypot(m.x - POOL.x, m.y - POOL.y);
    dots.push({ kind: 1, x0: m.x, y0: m.y, t0: RING0 + RING_DUR * (dist / RING_MAX), slot: slots[N_IN + i], ...base() });
  }
  for (let i = 0; i < N_MKT; i++) {
    const m = market();
    dots.push({ kind: 2, x0: m.x, y0: m.y, t0: 0, slot: -1, ...base() });
  }

  // Ten get through: six who applied, four who never did, and the best of
  // them is one who never applied.
  const applied = shuffle([...Array(N_IN).keys()], r);
  const found = shuffle([...Array(N_OUT).keys()].map((i) => N_IN + i), r);
  const top = [found[0], applied[0], applied[1], found[1], applied[2], applied[3], found[2], applied[4], found[3], applied[5]];
  top.forEach((d, rank) => Object.assign(dots[d], { fate: 4, rank }));
  const rest = shuffle([...Array(POOLN).keys()].filter((d) => dots[d].fate !== 4), r);
  rest.forEach((d, k) => (dots[d].fate = k < 12 ? 3 : k < 30 ? 2 : 1));
  shuffle([...Array(POOLN).keys()], r).forEach((d, order) => (dots[d].drop = 0.14 + (order / POOLN) * 0.48));
  return dots;
}

const DOTS = create();

export type Counts = { applied: number; found: number; through: number[] };

/** Draws the figure at progress p. `time` (seconds) only adds a little idle drift. */
export function drawJourney(ctx: CanvasRenderingContext2D, size: number, p: number, time: number): Counts {
  const a = clamp01(p / 0.34);
  const b = clamp01((p - 0.34) / 0.34);
  const c = clamp01((p - 0.68) / 0.32);
  const S = size;
  const R = Math.max(2.4, S * 0.0066);
  const counts: Counts = { applied: 0, found: 0, through: [0, 0, 0] };
  ctx.clearRect(0, 0, S, S);

  const pc = (() => {
    const t = ease(clamp01(b / 0.12));
    return { x: lerp(POOL.x, TOP.x, t), y: lerp(POOL.y, TOP.y, t), r: lerp(POOL.r, TOP.r, t) };
  })();

  // Source: the sonar ring reaching into the market, and its echo.
  if (b === 0) {
    for (const [off, k] of [[0, 0.32], [0.09, 0.14]] as const) {
      const t = (a - RING0 - off) / RING_DUR;
      if (t > 0 && t < 1) {
        ctx.beginPath();
        ctx.arc(POOL.x * S, POOL.y * S, t * RING_MAX * S, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(27,77,255,${k * (1 - t)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  // Evaluate: the three filters.
  const la = clamp01((b - 0.06) / 0.08) * (1 - clamp01(c / 0.1));
  if (la > 0) {
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = `rgba(10,12,15,${0.28 * la})`;
    for (const y of LINES) {
      ctx.beginPath();
      ctx.moveTo(0.08 * S, y * S);
      ctx.lineTo(0.92 * S, y * S);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Shortlist: tracks and score bars behind the dots.
  if (c > 0) {
    for (let i = 0; i < ROWS; i++) {
      const arrive = 0.23 + i * 0.025;
      const g = ease(clamp01((c - arrive + 0.04) / 0.25));
      if (g <= 0) continue;
      const y = rowY(i) * S;
      const h = Math.max(4, S * 0.011);
      ctx.fillStyle = `rgba(232,234,237,${g})`;
      roundRect(ctx, COL.bar0 * S, y - h / 2, (COL.bar1 - COL.bar0) * S, h, h / 2);
      ctx.fillStyle = "rgb(10,12,15)";
      ctx.globalAlpha = 0.88;
      roundRect(ctx, COL.bar0 * S, y - h / 2, (COL.bar1 - COL.bar0) * SCORES[i] * g * S, h, h / 2);
      ctx.globalAlpha = 1;
      if (i < BOOKED) {
        const t = easeOut(clamp01((c - 0.55 - i * 0.06) / 0.1));
        if (t > 0) glyph(ctx, COL.glyph * S, y, S * 0.03 * (0.7 + 0.3 * t), t);
      }
    }
  }

  for (const d of DOTS) {
    let x = d.x0;
    let y = d.y0;
    let alpha = 1;
    let col = d.kind === 1 ? SIGNAL : INK;
    let colT: number[] | null = null;
    let t = 0;
    let rad = R;
    let rest = 0;
    let ring = false;

    if (d.kind === 2) {
      // The market: people who are not a match. They stay where they are.
      alpha = 0.6 * (1 - clamp01(b / 0.1));
      col = GREY;
      rad = R * 0.62;
      rest = 1;
    } else if (b === 0) {
      const home = slotPos(d.slot, POOL);
      if (d.kind === 0) {
        const u = clamp01((a - d.t0) / 0.3);
        if (u <= 0) continue;
        const e = ease(u);
        const cx = 0.16;
        const cy = d.y0 * 0.6 + 0.2;
        x = (1 - e) * (1 - e) * d.x0 + 2 * (1 - e) * e * cx + e * e * home.x;
        y = (1 - e) * (1 - e) * d.y0 + 2 * (1 - e) * e * cy + e * e * home.y;
        alpha = Math.min(1, u * 5);
        rest = e;
        if (u >= 1) counts.applied++;
      } else {
        const since = a - d.t0;
        const f = clamp01(since / 0.05);
        colT = GREY;
        t = 1 - f;
        rad = R * lerp(0.62, 1, f);
        alpha = lerp(0.6, 1, f);
        const u = ease(clamp01((since - 0.03) / 0.3));
        x = lerp(d.x0, home.x, u);
        y = lerp(d.y0, home.y, u);
        rest = since < 0 ? 1 : u;
        if (since >= 0 && since < 0.18) {
          // The line that reaches out to them.
          ctx.beginPath();
          ctx.moveTo(POOL.x * S, POOL.y * S);
          ctx.lineTo(x * S, y * S);
          ctx.strokeStyle = `rgba(27,77,255,${0.35 * (1 - since / 0.18)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (since >= 0) counts.found++;
      }
    } else {
      counts.applied = N_IN;
      counts.found = N_OUT;
      if (c > 0 && d.fate <= 3) continue;
      const top = slotPos(d.slot, TOP);
      const tb = b - d.drop;
      if (tb <= 0) {
        const h = slotPos(d.slot, pc);
        x = h.x;
        y = h.y;
        rest = 1;
      } else {
        x = lerp(top.x, d.lane, ease(clamp01(tb / 0.08)));
        y = top.y + FALL * tb;
        for (let i = 0; i < 3; i++) {
          const cross = (LINES[i] - top.y) / FALL;
          if (d.fate > i + 1 && tb >= cross) {
            counts.through[i]++;
            if (tb - cross < 0.035 && c === 0) {
              // A brief mark where it passes the filter.
              ctx.fillStyle = `rgba(27,77,255,${0.6 * (1 - (tb - cross) / 0.035)})`;
              ctx.fillRect(x * S - 7, LINES[i] * S - 1, 14, 2);
            }
          }
        }
        if (d.fate <= 3) {
          const ly = LINES[d.fate - 1];
          const hit = (ly - top.y) / FALL;
          if (tb >= hit) {
            // Stopped: deflected off the filter and blown away like chaff.
            const td = clamp01((tb - hit) / 0.14);
            x = d.lane + d.side * d.spread * easeOut(td);
            y = ly - 0.035 * Math.sin(Math.PI * Math.min(1, td * 1.4)) + 0.05 * td;
            alpha = 1 - td;
            colT = GREY;
            t = Math.min(1, td * 2.5);
            if (alpha <= 0) continue;
          }
        } else {
          ring = y > LINES[2];
          const binAt = (BIN.y - 0.07 - top.y) / FALL;
          if (tb >= binAt) {
            const ts = ease(clamp01((tb - binAt) / 0.08));
            const bs = slotPos(d.rank, BIN, ROWS);
            x = lerp(d.lane, bs.x, ts);
            y = lerp(BIN.y - 0.07, bs.y, ts);
            rest = ts;
          }
          if (c > 0) {
            const bs = slotPos(d.rank, BIN, ROWS);
            const u = ease(clamp01((c - 0.03 - d.rank * 0.025) / 0.2));
            x = lerp(bs.x, COL.dot, u);
            y = lerp(bs.y, rowY(d.rank), u);
            rest = 1 - u;
          }
        }
      }
    }

    // A little idle drift, only while a dot is at rest.
    if (rest > 0) {
      x += Math.sin(time * 0.9 + d.ph) * 0.0022 * rest;
      y += Math.cos(time * 1.1 + d.ph) * 0.0022 * rest;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = mix(col, colT ?? col, t);
    ctx.beginPath();
    ctx.arc(x * S, y * S, rad, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
      // Verified.
      ctx.beginPath();
      ctx.arc(x * S, y * S, rad + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(27,77,255,0.45)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return counts;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0) return;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2));
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

/** Interview booked: a small calendar tile with a tick. */
function glyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, a: number) {
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgb(27,77,255)";
  roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.28);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, cy + s * 0.02);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.18);
  ctx.lineTo(cx + s * 0.24, cy - s * 0.16);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
