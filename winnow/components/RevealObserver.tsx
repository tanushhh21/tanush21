"use client";

import { useEffect } from "react";

/** One IntersectionObserver for every [data-reveal] on the page. */
export default function RevealObserver() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
