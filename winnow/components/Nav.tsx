"use client";

import { useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#shortlist", label: "Shortlist" },
  { href: "#pricing", label: "Pricing" },
];

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
        <div className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="link-underline text-[14px] text-slate transition-colors duration-150 hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="#talk"
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-paper transition-transform duration-200 ease-standard hover:-translate-y-px"
          >
            Talk to us
          </a>
        </div>
      </nav>
    </header>
  );
}
