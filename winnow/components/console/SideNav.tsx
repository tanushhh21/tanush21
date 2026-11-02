"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

export type NavRole = { id: string; title: string; status: string; tone: "alert" | "caution" | "signal" | "muted" };

type Props = {
  org: { id: string; name: string };
  orgCount: number;
  level: string;
  user: { name: string; email: string };
  roles: NavRole[];
  needsYou: number;
  unread: number;
  canCreateRole: boolean;
  isOperator: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

/** Five places, each a plain word. Company knowledge and the audit log live in Settings. */
const MAIN = [
  { href: "/console", label: "Home", exact: true, icon: "M3.75 9.25 10 4l6.25 5.25V16a.75.75 0 0 1-.75.75H12.5V12h-5v4.75H4.5a.75.75 0 0 1-.75-.75Z" },
  { href: "/console/chat", label: "Chat", icon: "M4 4.75h12a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H9l-3.5 2.75V13.75H4a.75.75 0 0 1-.75-.75V5.5A.75.75 0 0 1 4 4.75Z" },
  { href: "/console/talent", label: "People", icon: "M7.5 9.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2.75 16.25c0-2.6 2.1-4.25 4.75-4.25s4.75 1.65 4.75 4.25M13.25 9a2.25 2.25 0 1 0 0-4.5M14.5 12.1c1.6.4 2.75 1.8 2.75 4.15" },
  { href: "/console/analytics", label: "Insights", icon: "M4 16.25V10.5M8 16.25V6.5M12 16.25v-4.5M16 16.25V3.75" },
  { href: "/console/settings", label: "Settings", also: ["/console/brain", "/console/audit"], icon: "M3.75 6.25h6.5M13.75 6.25h2.5M3.75 13.75h2.5M9.75 13.75h6.5M12 4.25v4M8 11.75v4" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const toneDot = { alert: "bg-alert", caution: "bg-caution", signal: "bg-signal", muted: "bg-hairline" };

function NavLink({ href, active, children, onClick }: { href: string; active: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-[6px] px-2 text-[13px] transition-colors duration-100 max-lg:h-10 max-lg:text-[14px] ${
        active ? "bg-ink/[0.06] font-medium text-ink" : "text-[#3d434d] hover:bg-ink/[0.04] hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default function SideNav(p: Props) {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const is = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const close = () => setOpen(false);

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-1 px-2.5 pt-1">
        <Link
          href={p.orgCount > 1 ? "/console/orgs" : "/console/settings"}
          onClick={close}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 py-1.5 hover:bg-ink/[0.04]"
          title={p.orgCount > 1 ? "Switch company" : "Company settings"}
        >
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-ink text-[12px] font-semibold text-paper">
            {p.org.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{p.org.name}</span>
            <span className="block truncate text-[11.5px] leading-tight text-slate">{p.level}</span>
          </span>
          {p.orgCount > 1 ? (
            <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-slate" aria-hidden="true">
              <path d="m6.5 8 3.5-3 3.5 3M6.5 12l3.5 3 3.5-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </Link>
        <Link href="/console/notifications" onClick={close} className="relative shrink-0 rounded-[6px] p-1.5 text-slate hover:bg-ink/[0.04] hover:text-ink" aria-label={`Notifications${p.unread ? `, ${p.unread} unread` : ""}`}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path d="M10 2.75a4.75 4.75 0 0 0-4.75 4.75v2.3c0 .5-.17.98-.48 1.37L3.6 12.6a.9.9 0 0 0 .7 1.47h11.4a.9.9 0 0 0 .7-1.47l-1.17-1.43a2.18 2.18 0 0 1-.48-1.37V7.5A4.75 4.75 0 0 0 10 2.75Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 16.25a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {p.unread ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-signal ring-2 ring-mist" /> : null}
        </Link>
      </div>

      <nav aria-label="Console" className="mt-2 flex-1 overflow-y-auto px-2.5 pb-4">
        <ul className="grid gap-px">
          {MAIN.map((m) => (
            <li key={m.href}>
              <NavLink href={m.href} active={is(m.href, m.exact) || !!m.also?.some((a) => is(a))} onClick={close}>
                <Icon d={m.icon} />
                <span className="flex-1">{m.label}</span>
                {m.href === "/console" && p.needsYou ? (
                  <span className="min-w-5 rounded-full bg-signal px-1.5 text-center text-[11px] font-medium leading-[18px] text-paper tabular-nums">{p.needsYou}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
          {p.isOperator ? (
            <li>
              <NavLink href="/console/operator" active={is("/console/operator")} onClick={close}>
                <Icon d="M10 2.75 16.25 5v4.5c0 3.6-2.6 6.4-6.25 7.75C6.35 15.9 3.75 13.1 3.75 9.5V5Z" />
                <span className="flex-1">Operator console</span>
              </NavLink>
            </li>
          ) : null}
        </ul>

        <div className="mt-5 flex h-7 items-center justify-between pl-2 pr-1">
          <p className="text-[12px] font-medium text-slate">Open roles</p>
          {p.canCreateRole ? (
            <Link href="/console/chat?new=1" onClick={close} className="grid size-6 place-items-center rounded-[6px] text-slate hover:bg-ink/[0.05] hover:text-ink" aria-label="New role" title="New role">
              <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Link>
          ) : null}
        </div>
        <ul className="mt-0.5 grid gap-px">
          {p.roles.length === 0 ? <li className="px-2 py-1.5 text-[13px] text-slate">No open roles</li> : null}
          {p.roles.map((r) => (
            <li key={r.id}>
              <NavLink href={`/console/roles/${r.id}`} active={is(`/console/roles/${r.id}`)} onClick={close}>
                <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true"><span className={`size-1.5 rounded-full ${toneDot[r.tone]}`} /></span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="sr-only">, {r.status}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-2 border-t border-hairline px-2.5 py-2">
        <Link href="/console/settings/account" onClick={close} className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 py-1.5 hover:bg-ink/[0.04]" aria-label="Your account">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-signal/10 text-[11px] font-semibold text-signal">
            {(p.user.name || p.user.email).trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium leading-tight text-ink">{p.user.name}</span>
            <span className="block truncate text-[11.5px] leading-tight text-slate">{p.user.email}</span>
          </span>
        </Link>
        <form action={p.signOut}>
          <button type="submit" className="rounded-[6px] px-2 py-1.5 text-[12px] text-slate hover:bg-ink/[0.04] hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
      <div className="flex items-center gap-1.5 px-4 pb-3 text-[11px] text-slate/80">
        <Logo size={12} />
      </div>
    </div>
  );

  return (
    <>
      {/* Phones and tablets: a top bar with a menu. */}
      <div className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-hairline bg-paper/90 px-4 backdrop-blur-[12px] lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 rounded-[6px] p-2 text-ink hover:bg-mist"
        >
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/console" aria-label="Winnow home">
          <Logo size={16} />
        </Link>
        <Link href="/console" className="relative -mr-2 rounded-full p-2 text-[12.5px] font-medium text-ink" aria-label={`${p.needsYou} items need you`}>
          {p.needsYou ? <span className="rounded-full bg-signal px-1.5 py-0.5 font-mono text-[11px] text-paper tabular-nums">{p.needsYou}</span> : <span className="text-slate">0</span>}
        </Link>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/25" onClick={close} />
          <div className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] bg-mist shadow-lift-hover">{body}</div>
        </div>
      ) : null}

      {/* Desktop: a fixed sidebar. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-hairline bg-mist lg:block">{body}</aside>
    </>
  );
}
