"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import {
  INK,
  P,
  SIGNAL,
  computeLayout,
  createField,
  makeSettled,
  makeSprite,
  placeField,
  renderField,
  sourcingDone,
  type Layout,
  type Settled,
} from "@/lib/field";

// One short line per act, shown while that act plays.
const CAPTIONS = [
  { from: 0.06, to: 0.21, text: "Applied, and sourced." },
  { from: 0.21, to: 0.56, text: "Every profile, read." },
  { from: 0.56, to: 0.74, text: "Verified before the interview." },
  { from: 0.74, to: 1.5, text: "You interview. You make the offer." },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 across a window, with short fades at each end. */
const windowed = (p: number, from: number, to: number, fade = 0.025) =>
  smooth(from, from + fade, p) * (1 - smooth(to - fade, to, p));

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const wordBoxRef = useRef<HTMLDivElement>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  const lockWordRef = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const intro = introRef.current!;
    const wordBox = wordBoxRef.current!;
    const captions = Array.from(captionsRef.current!.children) as HTMLElement[];
    const lockWord = lockWordRef.current!;
    const ctx = canvas.getContext("2d")!;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const driftOn = !reduce && !phone && !coarse;
    const wordFamily = getComputedStyle(lockWord).fontFamily;

    const field = createField(phone ? 700 : 2000, phone);
    const sprites = { ink: makeSprite(INK), signal: makeSprite(SIGNAL) };
    let layout: Layout | null = null;
    let settled: Settled | undefined;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let readyAt = -1;
    let sourceT = reduce ? field.sourceTotal : 0;
    const cache = new Map<string, string>();
    const set = (el: HTMLElement, prop: string, value: string) => {
      const key = el.dataset.k + prop;
      if (cache.get(key) === value) return;
      cache.set(key, value);
      el.style.setProperty(prop, value);
    };
    [intro, lockWord, ...captions].forEach((el, i) => (el.dataset.k = String(i)));
    const t0 = performance.now();

    const progress = () => (reduce ? 0 : clamp01(scrollYProgress.get()));

    const draw = (now: number) => {
      if (!layout) return;
      const p = progress();
      if (!reduce && readyAt >= 0) {
        // Scrolling hurries any stragglers in, so the word is whole before it dissolves.
        const hurry = smooth(0, P.dissolveFrom, p) * field.sourceTotal;
        sourceT = Math.max(sourceT, (now - readyAt) / 1000 + hurry);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderField(ctx, field, layout, { p, sourceT, time: (now - t0) / 1000, drift: driftOn ? 9 : 0 }, sprites, settled);
      if (reduce) return;

      const io = 1 - smooth(0.005, 0.05, p);
      set(intro, "opacity", io.toFixed(3));
      set(intro, "transform", `translateY(${(-24 * (1 - io)).toFixed(1)}px)`);
      set(intro, "visibility", io < 0.01 ? "hidden" : "visible");
      captions.forEach((el, i) => {
        const v = windowed(p, CAPTIONS[i].from, CAPTIONS[i].to);
        set(el, "opacity", v.toFixed(3));
        set(el, "transform", `translateY(${(16 * (1 - v)).toFixed(1)}px)`);
        set(el, "visibility", v < 0.01 ? "hidden" : "visible");
      });
      const lw = smooth(P.settleFrom, P.settleTo, p);
      set(lockWord, "opacity", lw.toFixed(3));
      set(lockWord, "transform", `translate(${(-10 * (1 - lw)).toFixed(1)}px, -50%)`);
    };

    const needsLoop = () => driftOn || (readyAt >= 0 && !sourcingDone(field, sourceT));
    const loop = (now: number) => {
      draw(now);
      raf = visible && needsLoop() ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      const s = stage.getBoundingClientRect();
      const b = wordBox.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(s.width * dpr);
      canvas.height = Math.round(s.height * dpr);
      const mobile = s.width < 640;
      const word = { cx: b.left - s.left + b.width / 2, cy: b.top - s.top + b.height / 2, width: b.width };
      // The closing lockup: the mark where the word was, the wordmark beside it.
      const spacing = mobile ? 26 : 44;
      const markR = mobile ? 5.5 : 8;
      const gap = mobile ? 16 : 30;
      const total = 3 * spacing + 2 * markR + gap + lockWord.offsetWidth;
      const markCx = s.width / 2 - total / 2 + 1.5 * spacing + markR;
      layout = computeLayout(s.width, s.height, word, { x: markCx, y: word.cy, s: spacing });
      lockWord.style.left = `${markCx + 1.5 * spacing + markR + gap}px`;
      lockWord.style.top = `${word.cy}px`;
      placeField(field, layout, wordFamily);
      settled = makeSettled(field, s.width, s.height, dpr);
      kick();
    };

    let idle = 0;
    let cancelled = false;
    const begin = () => {
      canvas.setAttribute("data-ready", "");
      readyAt = performance.now();
      kick();
    };
    // The word is sampled from the wordmark font, so wait for it; then start
    // once the page has hydrated, so the opening never competes with first paint.
    document.fonts
      .load(`700 100px ${wordFamily}`)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        resize();
        if (reduce) return begin();
        window.setTimeout(() => {
          if (cancelled) return;
          if ("requestIdleCallback" in window) idle = window.requestIdleCallback(begin, { timeout: 900 });
          else begin();
        }, Math.max(0, 450 - performance.now()));
      });

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 120);
    });
    ro.observe(stage);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(section);

    const unsub = reduce ? () => {} : scrollYProgress.on("change", kick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      if (idle) window.cancelIdleCallback(idle);
      ro.disconnect();
      io.disconnect();
      unsub();
    };
  }, [scrollYProgress]);

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-labelledby="hero-heading"
      className="relative h-[400svh] motion-reduce:h-[100svh]"
    >
      <div ref={stageRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas ref={canvasRef} aria-hidden="true" className="hero-canvas absolute inset-0 h-full w-full" />

        <div
          ref={introRef}
          className="wrap relative flex h-full flex-col items-center justify-center pt-16 text-center"
        >
          {/* The wordmark is drawn in dots on the canvas; this box reserves its
              space and holds a plain fallback for when the canvas cannot run. */}
          <div ref={wordBoxRef} className="hero-word flex w-[min(84vw,860px)] items-center justify-center sm:w-[min(62vw,860px)]">
            <span className="hero-word-fallback font-wordmark font-bold leading-none tracking-[-0.03em] text-ink">
              winnow
            </span>
          </div>

          <h1 id="hero-heading" className="hero-tagline mt-10 text-ink sm:mt-12">
            <span className="sr-only">Winnow. </span>
            <span className="block overflow-hidden pb-[0.08em]">
              <span className="load-rise block" style={{ animationDelay: "260ms" }}>
                Find faster. Read smarter. <span className="text-signal">Hire better.</span>
              </span>
            </span>
          </h1>
          <p className="body-lg mt-4 overflow-hidden">
            <span className="load-rise block" style={{ animationDelay: "340ms" }}>
              AI-native hiring for Indian companies.
            </span>
          </p>
          <div className="load-fade mt-9" style={{ animationDelay: "450ms" }}>
            <a href="#talk" className="btn-primary">
              Talk to us
            </a>
          </div>
        </div>

        <div ref={captionsRef} className="pointer-events-none absolute inset-x-0 bottom-[16svh] motion-reduce:hidden">
          {CAPTIONS.map((c) => (
            <p key={c.text} className="hero-caption wrap display-lg absolute inset-x-0 bottom-0 text-center text-ink">
              {c.text}
            </p>
          ))}
        </div>

        <span
          ref={lockWordRef}
          aria-hidden="true"
          className="hero-lockword pointer-events-none absolute font-wordmark font-bold leading-none tracking-[-0.03em] text-ink"
        >
          winnow
        </span>
      </div>
    </section>
  );
}
