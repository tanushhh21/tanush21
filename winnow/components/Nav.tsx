"use client";

import { useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import Logo from "./Logo";

const LINKS = [
  { href: "#why", label: "Why Winnow" },
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
        solid ? "border-hairline bg-paper/85 backdrop-blur-[12px]" : "border-transparent bg-transparent"
      }`}
    >
      <nav aria-label="Primary" className="wrap flex h-16 items-center justify-between">
        <a href="#top" aria-label="Winnow, back to top">
          <Logo size={21} />
        </a>
        <div className="flex items-center gap-8">
          <ul className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[13.5px] text-slate transition-colors duration-150 hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a href="#talk" className="btn-primary !px-4 !py-1.5 !text-[13.5px]">
            Talk to us
          </a>
        </div>
      </nav>
    </header>
  );
}
