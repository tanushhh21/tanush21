"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import {
  INK,
  KEEP,
  SIGNAL,
  computeLayout,
  countAt,
  createField,
  makeSprite,
  renderField,
  type Field,
  type Layout,
} from "@/lib/field";

const fmt = new Intl.NumberFormat("en-US");
const SLATE = [107, 114, 128];

const ease = (p: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixColor = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ")})`;

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const appliedRef = useRef<HTMLSpanElement>(null);
  const findsRef = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const counter = counterRef.current!;
    const applied = appliedRef.current!;
    const finds = findsRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const driftOn = !reduce && !phone && !coarse;

    const field: Field = createField(phone ? 700 : 2000);
    const sprites = { ink: makeSprite(INK), signal: makeSprite(SIGNAL) };
    let layout: Layout = computeLayout(1, 1);
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let shown = false;
    let lastCount = -1;
    const t0 = performance.now();

    const progress = () => (reduce ? 1 : Math.min(1, Math.max(0, scrollYProgress.get())));

    const draw = (now: number) => {
      const p = progress();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderField(ctx, field, layout, p, (now - t0) / 1000, driftOn ? 9 : 0, sprites);
      const count = reduce ? KEEP : countAt(field, p);
      if (count !== lastCount) {
        counter.textContent = fmt.format(count);
        lastCount = count;
      }
      // The words follow the field: the two thousand recede to slate as they
      // are eliminated, and "Winnow finds them." lands in ink as the ten settle.
      applied.style.color = mixColor(INK, SLATE, ease(p, 0.12, 0.8));
      finds.style.color = mixColor(SLATE, INK, ease(p, 0.72, 0.95));
      if (!shown) {
        shown = true;
        // Load sequence: the field arrives after the headline has started to rise.
        const wait = Math.max(0, 450 - performance.now());
        setTimeout(() => canvas.setAttribute("data-ready", ""), reduce ? 0 : wait);
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = driftOn && visible ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      const { width, height } = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      layout = computeLayout(width, height);
      counter.style.transform = `translate(${layout.rowX0 - layout.keepR}px, ${layout.rowY - 40}px)`;
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

    // Without drift there is nothing to animate between scroll changes.
    const unsub = reduce ? () => {} : scrollYProgress.on("change", kick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      ro.disconnect();
      io.disconnect();
      unsub();
    };
  }, [scrollYProgress]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-heading"
      className="relative h-[200svh] motion-reduce:h-[100svh]"
    >
      <div ref={stageRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="hero-canvas absolute inset-0 h-full w-full"
        />
        <span
          ref={counterRef}
          aria-hidden="true"
          className="hero-counter label absolute left-0 top-0 tabular-nums"
        >
          2,000
        </span>
        <div className="wrap relative flex h-full flex-col justify-end pb-[max(5rem,14svh)]">
          <h1 id="hero-heading" className="display-xl hero-title">
            <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
              <span
                ref={appliedRef}
                className="load-rise block text-ink"
                style={{ animationDelay: "250ms" }}
              >
                Two thousand applied.
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
              <span className="load-rise block text-signal" style={{ animationDelay: "340ms" }}>
                Ten are worth meeting.
              </span>
            </span>
          </h1>
          <p className="body-lg mt-6 overflow-hidden sm:mt-8">
            <span ref={findsRef} className="load-rise block" style={{ animationDelay: "430ms" }}>
              Winnow finds them.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
