"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A row of section links with the current one underlined (Settings, and the like). */
export default function SubNav({ items, label }: { items: { href: string; label: string }[]; label: string }) {
  const path = usePathname() ?? "";
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-hairline px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="flex gap-1">
        {items.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={`relative flex whitespace-nowrap px-3 py-2.5 text-[13.5px] transition-colors ${active ? "font-medium text-ink" : "text-slate hover:text-ink"}`}>
                {t.label}
                {active ? <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
