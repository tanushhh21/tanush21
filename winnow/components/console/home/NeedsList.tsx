"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNeed } from "@/lib/console/actions/home";
import { Button, fieldClass } from "@/components/console/ui";

export type NeedItem = { key: string; type: string; label: string; roleTitle: string; roleId: string; person?: string; ageDays: number; text: string; action: { label: string; href: string }; priority: 0 | 1 | 2 };

/** The tiers, each with one colour that is also spelled out, so colour never carries it alone. */
const TIERS = [
  { tag: "P0", label: "Do today", hint: "A candidate or a decision is waiting on you", chip: "bg-alert/[0.09] text-alert" },
  { tag: "P1", label: "This week", hint: "Slowing a role down", chip: "bg-caution/[0.10] text-caution" },
  { tag: "P2", label: "When you can", hint: "Housekeeping", chip: "bg-ink/[0.06] text-slate" },
] as const;

const REASONS = ["Already handled", "Not relevant to me", "Waiting on someone else", "Not a real problem"];

/** Each kind of item gets one glyph and one tint, so the list can be read by shape before words. */
const KIND: Record<string, { tint: string; d: string }> = {
  reply_unread: { tint: "bg-signal/[0.09] text-signal", d: "M4 4.75h12a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H9l-3.5 2.75V13.75H4a.75.75 0 0 1-.75-.75V5.5A.75.75 0 0 1 4 4.75Z" },
  questions_drafted: { tint: "bg-signal/[0.09] text-signal", d: "M7.75 7.5a2.25 2.25 0 1 1 3.4 1.94c-.68.4-1.15.9-1.15 1.68v.38M10 14.25v.01" },
  shortlist_unseen: { tint: "bg-caution/[0.10] text-caution", d: "M7 6h9M7 10h9M7 14h9M4 6h.01M4 10h.01M4 14h.01" },
  manager_holding: { tint: "bg-caution/[0.10] text-caution", d: "M7 6h9M7 10h9M7 14h9M4 6h.01M4 10h.01M4 14h.01" },
  no_debrief: { tint: "bg-caution/[0.10] text-caution", d: "M7 4.75h6M6 3.75h8a1 1 0 0 1 1 1v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1ZM7.5 9.5h5M7.5 12.5h3.5" },
  contradiction_unread: { tint: "bg-alert/[0.08] text-alert", d: "M10 3.75 17 16H3Zm0 5v3m0 2.25v.01" },
  unanswered_twice: { tint: "bg-ink/[0.06] text-slate", d: "M3.75 6.5 10 11l6.25-4.5M4.5 5h11a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75h-11a.75.75 0 0 1-.75-.75v-8.5A.75.75 0 0 1 4.5 5Z" },
  rubric_unreviewed: { tint: "bg-ink/[0.06] text-slate", d: "M3.75 6.25h6.5M13.75 6.25h2.5M3.75 13.75h2.5M9.75 13.75h6.5M12 4.25v4M8 11.75v4" },
  waiting_at_stage: { tint: "bg-caution/[0.10] text-caution", d: "M10 16.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM10 6.75V10l2.25 1.5" },
  role_quiet: { tint: "bg-ink/[0.06] text-slate", d: "M3.75 11.5h3.5l1 2h3.5l1-2h3.5M5.25 4.75h9.5l1.5 6.75v4a.75.75 0 0 1-.75.75H4.5a.75.75 0 0 1-.75-.75v-4Z" },
};
const FALLBACK = { tint: "bg-ink/[0.06] text-slate", d: "M10 6v4.5M10 13.5v.01" };

/** The needs-you queue: keyboard-first (j/k, Enter opens, d dismisses), readable on a phone. */
export default function NeedsList({ items }: { items: NeedItem[] }) {
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey || dismissing) return;
      if (e.key === "j") setCursor((c) => Math.min(items.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "Enter" && items[cursor] && document.activeElement === document.body) router.push(items[cursor].action.href);
      else if (e.key === "d" && items[cursor]) setDismissing(items[cursor].key);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor, dismissing, router]);

  useEffect(() => {
    list.current?.querySelectorAll("li")[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const dismiss = (n: NeedItem, reason: string) =>
    start(async () => {
      const r = await dismissNeed(n.key, n.type, reason);
      if (!r.ok) return setError(r.error);
      setDismissing(null);
      setOther("");
      setError(null);
      router.refresh();
    });

  if (items.length === 0)
    return <p className="rounded-[8px] border border-dashed border-hairline px-4 py-6 text-center text-[13px] text-slate">You&rsquo;re all caught up.</p>;

  return (
    <div>
      <ol ref={list} className="grid gap-px">
        {items.map((n, i) => {
          const k = KIND[n.type] ?? FALLBACK;
          const tier = TIERS[n.priority] ?? TIERS[2];
          const first = i === 0 || items[i - 1].priority !== n.priority;
          const count = first ? items.filter((x) => x.priority === n.priority).length : 0;
          return (
          <li key={n.key}>
            {first ? (
              <div role="presentation" className={`flex items-baseline gap-2 px-2.5 pb-1.5 ${i === 0 ? "" : "mt-4"}`}>
                <span className={`rounded-[4px] px-1.5 py-px text-[11px] font-semibold tabular-nums ${tier.chip}`}>{tier.tag}</span>
                <span className="text-[12.5px] font-medium text-ink">{tier.label}</span>
                <span className="text-[12px] tabular-nums text-slate">{count}</span>
                <span className="hidden text-[12px] text-slate sm:inline">· {tier.hint}</span>
              </div>
            ) : null}
          <div className={`group relative rounded-[8px] px-2.5 py-2.5 transition-colors ${i === cursor ? "bg-mist" : ""}`} onMouseEnter={() => setCursor(i)}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-[7px] ${k.tint}`}>
                <svg viewBox="0 0 20 20" className="size-4">
                  <path d={k.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink max-sm:whitespace-normal">{n.text}</p>
                <p className="mt-0.5 truncate text-[12px] text-slate max-sm:whitespace-normal">
                  {n.label} · <Link href={`/console/roles/${n.roleId}`} className="hover:text-ink hover:underline">{n.roleTitle}</Link> · {n.ageDays === 0 ? "today" : `${n.ageDays}d`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Link href={n.action.href} className="inline-flex h-8 items-center gap-1 rounded-[6px] px-2.5 text-[12.5px] font-medium text-ink hover:bg-paper max-sm:border max-sm:border-hairline">
                  {n.action.label}
                  <svg viewBox="0 0 20 20" className="size-3.5 text-slate" aria-hidden="true">
                    <path d="m8 5.5 4.5 4.5L8 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <button
                  type="button"
                  aria-label={`Dismiss: ${n.text}`}
                  title="Dismiss"
                  aria-expanded={dismissing === n.key}
                  onClick={() => setDismissing(dismissing === n.key ? null : n.key)}
                  className="grid size-8 place-items-center rounded-[6px] text-slate/70 opacity-0 transition-opacity hover:bg-paper hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100 aria-expanded:opacity-100"
                >
                  <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                    <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            {dismissing === n.key ? (
              <div className="ml-11 mt-2 grid gap-2 rounded-[8px] border border-hairline bg-paper p-3">
                <p className="text-[13px] font-medium">Why dismiss it?</p>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <Button key={r} size="sm" disabled={pending} onClick={() => dismiss(n, r)}>
                      {r}
                    </Button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    dismiss(n, other);
                  }}
                >
                  <input value={other} onChange={(e) => setOther(e.target.value)} aria-label="Another reason" placeholder="Another reason" className={`${fieldClass} h-9`} autoFocus />
                  <Button type="submit" size="sm" disabled={pending || !other.trim()}>
                    Dismiss
                  </Button>
                </form>
                {error ? <p role="alert" className="text-[12.5px] text-alert">{error}</p> : null}
              </div>
            ) : null}
          </div>
          </li>
          );
        })}
      </ol>
    </div>
  );
}
