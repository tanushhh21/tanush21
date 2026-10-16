"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMotionValueEvent, useScroll } from "motion/react";
import Logo from "./Logo";
import { TABS } from "@/lib/site";


// "/pricing", "pricing.html" and "/pricing/" all name the same tab.
const slug = (p: string) => p.replace(/^.*\//, "").replace(/\.html$/, "") || p.replace(/\/+$/, "").replace(/^.*\//, "");

export default function Nav() {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 24));

  return (
    <header
      className={`load-fade fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-standard ${
        solid ? "border-hairline bg-paper/85 backdrop-blur-[12px]" : "border-transparent bg-transparent"
      }`}
    >
      <nav aria-label="Primary" className="wrap flex h-16 items-center justify-between gap-6">
        <a href="/" aria-label="Winnow home">
          <Logo size={21} />
        </a>
        <div className="flex items-center gap-6 sm:gap-8">
          <ul className="flex items-center gap-5 sm:gap-7">
            {TABS.map((t) => {
              const active = slug(path ?? "") === slug(t.href);
              return (
                <li key={t.href}>
                  <a
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative whitespace-nowrap py-2 text-[14px] transition-colors duration-150 ${
                      active ? "font-medium text-ink" : "text-slate hover:text-ink"
                    }`}
                  >
                    {t.label}
                    {active ? <span aria-hidden="true" className="absolute inset-x-0 -bottom-[3px] h-px bg-ink" /> : null}
                  </a>
                </li>
              );
            })}
          </ul>
          <a href="#talk" className="btn-primary hidden !px-4 !py-1.5 !text-[13.5px] sm:inline-flex">
            Book a call
          </a>
        </div>
      </nav>
    </header>
  );
}
