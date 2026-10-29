"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Company", items: [["organisation", "Profile"], ["knowledge", "Company knowledge"], ["reasons", "Decision reasons"], ["integrations", "Integrations"], ["billing", "Billing"]] },
  { title: "People", items: [["team", "Team and access"]] },
  { title: "Records", items: [["privacy", "Data and privacy"], ["audit", "Audit log"]] },
  { title: "You", items: [["account", "Your account"], ["notifications", "Notifications"]] },
];

/** Settings as one grouped list (a row of chips on phones), instead of eight tabs. */
export default function SettingsMenu() {
  const path = usePathname() ?? "";
  const active = (k: string) => path.startsWith(`/console/settings/${k}`);
  const link = (k: string, label: string, chip = false) => (
    <Link
      key={k}
      href={`/console/settings/${k}`}
      aria-current={active(k) ? "page" : undefined}
      className={
        chip
          ? `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] ${active(k) ? "bg-ink text-paper" : "bg-mist text-slate"}`
          : `block rounded-[8px] px-2.5 py-1.5 text-[13.5px] transition-colors ${active(k) ? "bg-mist font-medium text-ink" : "text-slate hover:text-ink"}`
      }
    >
      {label}
    </Link>
  );
  return (
    <>
      <nav aria-label="Settings" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
        {GROUPS.flatMap((g) => g.items.map(([k, l]) => link(k, l, true)))}
      </nav>
      <nav aria-label="Settings sections" className="hidden lg:block">
        <div className="sticky top-8 grid gap-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="px-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-slate/80">{g.title}</p>
              <div className="mt-1 grid gap-0.5">{g.items.map(([k, l]) => link(k, l))}</div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
