"use client";

import { useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";

export default function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 80));

  return (
    <header
      className={`load-fade fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-standard ${
        solid
          ? "border-hairline bg-paper/85 backdrop-blur-[12px]"
          : "border-transparent bg-transparent"
      }`}
    >
      <nav aria-label="Primary" className="wrap flex h-16 items-center justify-between">
        <a href="#top" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
          Winnow
        </a>
        <a href="#talk" className="link-underline text-[15px] font-medium text-ink">
          Talk to us
        </a>
      </nav>
    </header>
  );
}
