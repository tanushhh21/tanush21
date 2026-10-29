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
    <svg viewBox="0 0 20 20" className="size-[17px] shrink-0" aria-hidden="true">
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
      className={`flex min-h-9 items-center gap-2 rounded-[9px] px-2.5 text-[13.5px] transition-colors duration-150 ${
        active ? "bg-paper font-medium text-ink shadow-lift ring-1 ring-hairline" : "text-slate hover:bg-paper/70 hover:text-ink"
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
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/console" aria-label="Winnow home" onClick={close}>
          <Logo size={19} />
        </Link>
        <Link href="/console/notifications" onClick={close} className="relative rounded-full p-2 text-slate hover:bg-paper hover:text-ink" aria-label={`Notifications${p.unread ? `, ${p.unread} unread` : ""}`}>
          <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
            <path d="M10 2.75a4.75 4.75 0 0 0-4.75 4.75v2.3c0 .5-.17.98-.48 1.37L3.6 12.6a.9.9 0 0 0 .7 1.47h11.4a.9.9 0 0 0 .7-1.47l-1.17-1.43a2.18 2.18 0 0 1-.48-1.37V7.5A4.75 4.75 0 0 0 10 2.75Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 16.25a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {p.unread ? <span className="absolute right-1 top-1 size-2 rounded-full bg-signal ring-2 ring-mist" /> : null}
        </Link>
      </div>

      <div className="px-3">
        <Link
          href={p.orgCount > 1 ? "/console/orgs" : "/console/settings"}
          onClick={close}
          className="flex items-center justify-between rounded-[10px] border border-hairline bg-paper px-3 py-2 text-left hover:border-slate/40"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium text-ink">{p.org.name}</span>
            <span className="block text-[12px] text-slate">{p.level}</span>
          </span>
          {p.orgCount > 1 ? <span className="text-[12px] text-slate">Switch</span> : null}
        </Link>
      </div>

      <nav aria-label="Console" className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        <ul className="grid gap-0.5">
          {MAIN.map((m) => (
            <li key={m.href}>
              <NavLink href={m.href} active={is(m.href, m.exact) || !!m.also?.some((a) => is(a))} onClick={close}>
                <Icon d={m.icon} />
                <span className="flex-1">{m.label}</span>
                {m.href === "/console" && p.needsYou ? (
                  <span className="rounded-full bg-signal px-1.5 font-mono text-[11px] leading-[18px] text-paper tabular-nums">{p.needsYou}</span>
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

        <div className="mt-6 flex items-center justify-between px-2.5">
          <p className="text-[12px] font-medium text-slate">Roles</p>
          {p.canCreateRole ? (
            <Link href="/console/roles/new" onClick={close} className="text-[12.5px] font-medium text-signal hover:underline">
              + New role
            </Link>
          ) : null}
        </div>
        <ul className="mt-1.5 grid gap-0.5">
          {p.roles.length === 0 ? <li className="px-2.5 py-1.5 text-[13px] text-slate">No open roles</li> : null}
          {p.roles.map((r) => (
            <li key={r.id}>
              <NavLink href={`/console/roles/${r.id}`} active={is(`/console/roles/${r.id}`)} onClick={close}>
                <span className={`size-1.5 shrink-0 rounded-full ${toneDot[r.tone]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="sr-only">, {r.status}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-3">
        <Link href="/console/settings/account" onClick={close} className="min-w-0 rounded-[8px] hover:opacity-80" aria-label="Your account">
          <span className="block truncate text-[13px] font-medium text-ink">{p.user.name}</span>
          <span className="block truncate text-[12px] text-slate">{p.user.email}</span>
        </Link>
        <form action={p.signOut}>
          <button type="submit" className="rounded-full px-2.5 py-1.5 text-[12.5px] text-slate hover:bg-paper hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Phones and tablets: a top bar with a menu. */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-paper/90 px-4 backdrop-blur-[12px] lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 rounded-full p-2 text-ink hover:bg-mist"
        >
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/console" aria-label="Winnow home">
          <Logo size={18} />
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-hairline bg-mist lg:block">{body}</aside>
    </>
  );
}
