"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import {
  DISPLAY_TOTAL,
  INK,
  KEEP,
  SCAN_END,
  SCAN_START,
  SIGNAL,
  computeLayout,
  countsAt,
  createField,
  makeSprite,
  renderField,
  sourcingDone,
  type Layout,
} from "@/lib/field";

const fmt = new Intl.NumberFormat("en-IN");
const SLATE = [107, 114, 128];

const ease = (p: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixColor = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ")})`;

const LINES = [
  { text: "We find them.", delay: 220 },
  { text: "We read them all.", delay: 310 },
  { text: "You meet the ten.", delay: 400 },
];

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countsRef = useRef<HTMLDListElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const counts = countsRef.current!;
    const values = counts.querySelectorAll("dd");
    const lines = lineRefs.current;
    const ctx = canvas.getContext("2d")!;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const driftOn = !reduce && !phone && !coarse;
    const mono = getComputedStyle(counts).fontFamily;

    const field = createField(phone ? 700 : 2000, phone);
    const sprites = { ink: makeSprite(INK), signal: makeSprite(SIGNAL) };
    let layout: Layout = computeLayout(1, 1);
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let readyAt = -1; // clock when act 1 began
    let sourceT = reduce ? field.sourceTotal : 0;
    const shown = ["", "", "", "", ""];
    const t0 = performance.now();

    const progress = () => (reduce ? 1 : Math.min(1, Math.max(0, scrollYProgress.get())));

    const draw = (now: number) => {
      const p = progress();
      if (!reduce && readyAt >= 0) {
        // Scrolling hurries any stragglers in, so act 2 never reads a half-filled field.
        const hurry = ease(p, 0, SCAN_START) * field.sourceTotal;
        sourceT = Math.max(sourceT, (now - readyAt) / 1000 + hurry);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderField(
        ctx,
        field,
        layout,
        { p, sourceT, time: (now - t0) / 1000, drift: driftOn ? 9 : 0, mono },
        sprites,
      );

      const c = reduce
        ? { sourced: DISPLAY_TOTAL, read: DISPLAY_TOTAL, shortlisted: KEEP }
        : countsAt(field, sourceT, p);
      const next = [fmt.format(c.sourced), fmt.format(c.read), String(c.shortlisted)];
      next.forEach((v, i) => {
        if (v !== shown[i]) values[i].textContent = shown[i] = v;
      });

      // The headline follows the acts: each line recedes once its act is done.
      // Written only on change, so idle frames cost no style work.
      const c0 = mixColor(INK, SLATE, ease(p, SCAN_START, SCAN_START + 0.08));
      const c1 = mixColor(INK, SLATE, ease(p, SCAN_END, SCAN_END + 0.08));
      if (c0 !== shown[3]) lines[0]!.style.color = shown[3] = c0;
      if (c1 !== shown[4]) lines[1]!.style.color = shown[4] = c1;
    };

    const needsLoop = () => driftOn || (readyAt >= 0 && !sourcingDone(field, sourceT));
    const loop = (now: number) => {
      draw(now);
      raf = visible && needsLoop() ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };

    // Act 1 starts once the headline has begun to rise and the page has
    // finished hydrating, so the field never competes with first paint.
    let idle = 0;
    const begin = () => {
      canvas.setAttribute("data-ready", "");
      readyAt = performance.now();
      kick();
    };
    const startTimer = window.setTimeout(
      () => {
        if (reduce || !("requestIdleCallback" in window)) begin();
        else idle = window.requestIdleCallback(begin, { timeout: 900 });
      },
      reduce ? 0 : Math.max(0, 450 - performance.now()),
    );

    const resize = () => {
      const { width, height } = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      layout = computeLayout(width, height);
      counts.style.transform = `translate(${layout.rowX0 - layout.keepR}px, ${layout.rowY + 28}px)`;
      counts.style.width = `${layout.rowX1 - layout.rowX0 + layout.keepR * 2}px`;
      kick();
    };
    resize();

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
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      clearTimeout(startTimer);
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
      className="relative h-[300svh] motion-reduce:h-[100svh]"
    >
      <div ref={stageRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="hero-canvas absolute inset-0 h-full w-full"
        />
        <dl
          ref={countsRef}
          aria-hidden="true"
          className="hero-counter label absolute left-0 top-0 grid gap-1.5"
        >
          {[
            ["Sourced", fmt.format(DISPLAY_TOTAL)],
            ["Read in full", fmt.format(DISPLAY_TOTAL)],
            ["Shortlisted", String(KEEP)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6">
              <dt>{k}</dt>
              <dd className="tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="wrap relative flex h-full flex-col justify-end pb-[max(3.5rem,9svh)]">
          <h1 id="hero-heading" className="display-xl hero-title">
            {LINES.map((l, i) => (
              <span key={l.text} className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
                <span
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`load-rise block ${i === 2 ? "text-signal" : "text-ink"}`}
                  style={{ animationDelay: `${l.delay}ms` }}
                >
                  {l.text}
                </span>
              </span>
            ))}
          </h1>
          <div className="mt-7 grid gap-8 sm:mt-9 md:grid-cols-[minmax(0,34rem)_auto] md:items-end md:justify-between">
            <p className="body-lg overflow-hidden">
              <span className="load-rise block" style={{ animationDelay: "490ms" }}>
                Winnow is an AI-native hiring firm for teams in India. We search well past your
                inbound, read every profile in full, and bring you a shortlist with the reasons
                behind each name.
              </span>
            </p>
            <div className="load-fade flex items-center gap-7" style={{ animationDelay: "650ms" }}>
              <a
                href="#talk"
                className="inline-flex items-center rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-paper shadow-lift transition-[transform,box-shadow] duration-200 ease-standard hover:-translate-y-0.5 hover:shadow-lift-hover"
              >
                Talk to us
              </a>
              <a href="#how" className="link-underline text-[15px] font-medium text-ink">
                How it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
