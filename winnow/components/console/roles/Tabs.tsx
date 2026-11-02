"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Four places in a role. Candidates covers the ranked list, the claims to
 * check and the full record; Insights covers the pool and the history.
 * Role settings sit behind the gear in the header.
 */
const TABS = [
  { slug: "", label: "Candidates", also: ["verify", "candidates", "compare"] },
  { slug: "interviews", label: "Interviews", also: [] },
  { slug: "rubric", label: "Criteria", also: [] },
  { slug: "pool", label: "Insights", also: ["activity"] },
];

export default function Tabs({ roleId, counts }: { roleId: string; counts: Record<string, number> }) {
  const path = usePathname() ?? "";
  const base = `/console/roles/${roleId}`;
  return (
    <nav aria-label="Role" className="-mx-4 overflow-x-auto border-b border-hairline px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="-ml-2.5 flex gap-0.5">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = (t.slug ? path.startsWith(href) : path === base) || t.also.some((s) => path.startsWith(`${base}/${s}`));
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-[13px] transition-colors ${active ? "font-medium text-ink" : "text-slate hover:text-ink"}`}
              >
                {t.label}
                {counts[t.slug] ? <span className="rounded-full bg-signal px-1.5 font-mono text-[10.5px] leading-[16px] text-paper tabular-nums">{counts[t.slug]}</span> : null}
                {active ? <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A second, quieter row of choices inside a tab (Ranked / To check / Everyone). */
export function Segments({ items }: { items: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <div role="tablist" aria-label="View" className="inline-flex flex-wrap gap-0.5 rounded-[7px] bg-ink/[0.045] p-0.5">
      {items.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          role="tab"
          aria-selected={s.active}
          className={`inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[12.5px] transition-colors ${s.active ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(10_12_15/0.08),0_0_0_0.5px_rgb(10_12_15/0.06)]" : "text-slate hover:text-ink"}`}
        >
          {s.label}
          {s.count ? <span className="font-mono text-[11.5px] tabular-nums text-slate">{s.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
