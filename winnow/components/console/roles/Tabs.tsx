"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Ranking" },
  { slug: "verify", label: "Verify" },
  { slug: "rubric", label: "Rubric" },
  { slug: "pool", label: "Pool" },
  { slug: "candidates", label: "Candidates" },
  { slug: "interviews", label: "Interviews" },
  { slug: "activity", label: "Activity" },
  { slug: "settings", label: "Settings" },
];

export default function Tabs({ roleId, counts }: { roleId: string; counts: Record<string, number> }) {
  const path = usePathname() ?? "";
  const base = `/console/roles/${roleId}`;
  return (
    <nav aria-label="Role" className="-mx-4 overflow-x-auto border-b border-hairline px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="flex gap-1">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = t.slug ? path.startsWith(href) : path === base || path.startsWith(`${base}/compare`);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13.5px] transition-colors ${active ? "font-medium text-ink" : "text-slate hover:text-ink"}`}
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
