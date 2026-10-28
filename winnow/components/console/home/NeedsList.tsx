"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNeed } from "@/lib/console/actions/home";
import { Button, Kbd, fieldClass } from "@/components/console/ui";

export type NeedItem = { key: string; type: string; label: string; roleTitle: string; roleId: string; person?: string; ageDays: number; text: string; action: { label: string; href: string } };

const REASONS = ["Already handled", "Not relevant to me", "Waiting on someone else", "Not a real problem"];

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
    return <p className="rounded-[14px] border border-hairline px-4 py-5 text-[14px] text-slate">Nothing needs you right now.</p>;

  return (
    <div>
      <ol ref={list} className="divide-y divide-hairline overflow-hidden rounded-[14px] border border-hairline">
        {items.map((n, i) => (
          <li key={n.key} className={`relative px-4 py-3 ${i === cursor ? "bg-mist/70" : ""}`} onMouseEnter={() => setCursor(i)}>
            {i === cursor ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-ink" /> : null}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-slate">
                  {n.label} · <Link href={`/console/roles/${n.roleId}`} className="hover:text-ink hover:underline">{n.roleTitle}</Link> · {n.ageDays === 0 ? "today" : `${n.ageDays} day${n.ageDays === 1 ? "" : "s"}`}
                </p>
                <p className="mt-0.5 text-[14.5px] font-medium">{n.text}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Link href={n.action.href} className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-paper hover:bg-ink/85 sm:h-8 sm:px-3 sm:text-[13px]">
                  {n.action.label}
                </Link>
                <Button size="sm" tone="ghost" aria-expanded={dismissing === n.key} onClick={() => setDismissing(dismissing === n.key ? null : n.key)}>
                  Dismiss
                </Button>
              </div>
            </div>
            {dismissing === n.key ? (
              <div className="mt-3 grid gap-2 rounded-[12px] border border-hairline bg-paper p-3">
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
          </li>
        ))}
      </ol>
      <p className="mt-2 hidden text-[12px] text-slate sm:block">
        <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>Enter</Kbd> open · <Kbd>d</Kbd> dismiss
      </p>
    </div>
  );
}
