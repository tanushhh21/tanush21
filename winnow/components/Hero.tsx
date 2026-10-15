"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import {
  DISPLAY_TOTAL,
  INK,
  KEEP,
  P,
  SIGNAL,
  computeLayout,
  countsAt,
  createField,
  makeSettled,
  makeSprite,
  placeField,
  renderField,
  sourcingDone,
  type Layout,
  type Settled,
} from "@/lib/field";

const fmt = new Intl.NumberFormat("en-IN");

// Scroll windows for the captions that narrate each act.
const CAPTIONS = [
  {
    from: 0.06,
    to: 0.21,
    title: "Found everywhere.",
    body: "LinkedIn, GitHub, Naukri, referrals, alumni networks and your inbound, merged into one pipeline.",
  },
  {
    from: 0.21,
    to: 0.56,
    title: "Read in full.",
    body: "Every profile is read against the bar you set, not skimmed for keywords.",
  },
  {
    from: 0.56,
    to: 0.74,
    title: "Narrowed with care.",
    body: "A second, deeper read on everyone still in the running.",
  },
  {
    from: 0.74,
    to: 1.5,
    title: "Ten names. One hire.",
    body: "Every name arrives with the reasons behind it.",
  },
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
  const countsRef = useRef<HTMLDListElement>(null);
  const lockWordRef = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const intro = introRef.current!;
    const wordBox = wordBoxRef.current!;
    const captions = Array.from(captionsRef.current!.children) as HTMLElement[];
    const counts = countsRef.current!;
    const values = counts.querySelectorAll("dd");
    const lockWord = lockWordRef.current!;
    const ctx = canvas.getContext("2d")!;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const driftOn = !reduce && !phone && !coarse;
    const mono = getComputedStyle(counts).fontFamily;
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
    [intro, counts, lockWord, ...captions].forEach((el, i) => (el.dataset.k = String(i)));
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
      renderField(
        ctx,
        field,
        layout,
        { p, sourceT, time: (now - t0) / 1000, drift: driftOn ? 9 : 0, mono },
        sprites,
        settled,
      );
      if (reduce) return;

      // Intro out; captions narrate each act; the lockup completes the mark.
      const io = 1 - smooth(0.005, 0.05, p);
      set(intro, "opacity", io.toFixed(3));
      set(intro, "transform", `translateY(${(-24 * (1 - io)).toFixed(1)}px)`);
      set(intro, "visibility", io < 0.01 ? "hidden" : "visible");
      captions.forEach((el, i) => {
        const c = CAPTIONS[i];
        const v = windowed(p, c.from, c.to);
        set(el, "opacity", v.toFixed(3));
        set(el, "transform", `translateY(${(16 * (1 - v)).toFixed(1)}px)`);
        set(el, "visibility", v < 0.01 ? "hidden" : "visible");
      });
      set(counts, "opacity", smooth(0.08, 0.12, p).toFixed(3));
      const lw = smooth(P.settleFrom, P.settleTo, p);
      set(lockWord, "opacity", lw.toFixed(3));
      set(lockWord, "transform", `translate(${(-10 * (1 - lw)).toFixed(1)}px, -50%)`);

      const c = countsAt(field, sourceT, p);
      const next = [fmt.format(c.sourced), fmt.format(c.read), String(c.shortlisted)];
      next.forEach((v, i) => {
        if (values[i].textContent !== v) values[i].textContent = v;
      });
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
      const ww = lockWord.offsetWidth;
      const total = 3 * spacing + 2 * markR + gap + ww;
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
    // the stream once the page has hydrated, so it never competes with first paint.
    document.fonts
      .load(`700 100px ${wordFamily}`)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        resize();
        if (reduce) return begin();
        const wait = Math.max(0, 450 - performance.now());
        window.setTimeout(() => {
          if (cancelled) return;
          if ("requestIdleCallback" in window) idle = window.requestIdleCallback(begin, { timeout: 900 });
          else begin();
        }, wait);
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
          className="wrap relative flex h-full flex-col items-center justify-center pt-[9.5rem] pb-10 text-center sm:pt-[8.5rem]"
        >
          <a
            href="#talk"
            className="load-fade group inline-flex items-center gap-2.5 rounded-full border border-hairline bg-paper/80 py-1.5 pl-2 pr-4 text-[13px] text-ink transition-colors duration-200 hover:border-ink/30"
            style={{ animationDelay: "150ms" }}
          >
            <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-medium text-paper">New</span>
            Now onboarding three design partners
            <span aria-hidden="true" className="text-slate transition-transform duration-200 group-hover:translate-x-0.5">
              ›
            </span>
          </a>

          {/* The wordmark is drawn in dots on the canvas; this box reserves its
              space and holds a plain fallback for when the canvas cannot run. */}
          <div
            ref={wordBoxRef}
            className="hero-word mt-8 flex w-[min(84vw,860px)] items-center justify-center sm:mt-10 sm:w-[min(62vw,860px)]"
          >
            <span className="hero-word-fallback font-wordmark font-bold leading-none tracking-[-0.03em] text-ink">
              winnow
            </span>
          </div>

          <h1 id="hero-heading" className="hero-tagline mt-8 text-ink sm:mt-10">
            <span className="sr-only">Winnow. </span>
            <span className="block overflow-hidden pb-[0.08em]">
              <span className="load-rise block" style={{ animationDelay: "260ms" }}>
                Find faster. Read smarter. <span className="text-signal">Hire better.</span>
              </span>
            </span>
          </h1>
          <p className="body-lg mt-4 max-w-[34rem] overflow-hidden">
            <span className="load-rise block" style={{ animationDelay: "350ms" }}>
              The AI-native hiring firm for teams in India.
            </span>
          </p>
          <div className="load-fade mt-8 flex items-center gap-7" style={{ animationDelay: "500ms" }}>
            <a href="#talk" className="btn-primary">
              Talk to us
            </a>
            <a href="#how" className="link-chevron">
              See how it works <span aria-hidden="true">›</span>
            </a>
          </div>
        </div>

        <div ref={captionsRef} className="pointer-events-none absolute inset-x-0 bottom-[17svh] motion-reduce:hidden">
          {CAPTIONS.map((c) => (
            <div key={c.title} className="hero-caption wrap absolute inset-x-0 bottom-0 text-center">
              <p className="display-lg text-ink">{c.title}</p>
              <p className="body-lg mx-auto mt-3 max-w-[32rem]">{c.body}</p>
            </div>
          ))}
        </div>

        <dl
          ref={countsRef}
          aria-hidden="true"
          className="hero-counts label absolute inset-x-0 bottom-[8svh] flex justify-center gap-5 sm:gap-10 motion-reduce:hidden"
        >
          {[
            ["Sourced", "Sourced", fmt.format(DISPLAY_TOTAL)],
            ["Read", "Read in full", fmt.format(DISPLAY_TOTAL)],
            ["Shortlisted", "Shortlisted", String(KEEP)],
          ].map(([short, k, v]) => (
            <div key={k} className="flex items-baseline gap-2 sm:gap-2.5">
              <dt>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{k}</span>
              </dt>
              <dd className="tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>

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
