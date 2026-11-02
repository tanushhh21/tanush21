"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNeed } from "@/lib/console/actions/home";
import { Button, Kbd, buttonClass, fieldClass, smallFieldClass } from "@/components/console/ui";
import { FALLBACK, KIND, REASONS, TIERS, type NeedItem } from "@/components/console/home/NeedsList";

type Item = NeedItem & { why: string };
type Tier = "all" | 0 | 1 | 2;

function Glyph({ type, size = "md" }: { type: string; size?: "md" | "lg" }) {
  const k = KIND[type] ?? FALLBACK;
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center ${size === "lg" ? "size-10 rounded-[9px]" : "size-7 rounded-[6px]"} ${k.tint}`}>
      <svg viewBox="0 0 20 20" className={size === "lg" ? "size-5" : "size-3.5"}>
        <path d={k.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const ageLabel = (d: number) => (d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`);

/**
 * Needs you as an inbox, after Linear's and Superhuman's: one list sorted by
 * what blocks, filtered by tier or role, with the selected item open beside
 * it. j/k move, Enter does the action, d dismisses. On a phone the detail
 * opens under the row instead of beside it.
 */
export default function Inbox({ items, initial }: { items: Item[]; initial: string | null }) {
  const router = useRouter();
  const [tier, setTier] = useState<Tier>("all");
  const [role, setRole] = useState("");
  const shown = useMemo(() => items.filter((i) => (tier === "all" || i.priority === tier) && (!role || i.roleId === role)), [items, tier, role]);
  const [sel, setSel] = useState<string | null>(initial && items.some((i) => i.key === initial) ? initial : (items[0]?.key ?? null));
  const current = shown.find((i) => i.key === sel) ?? shown[0] ?? null;
  const [dismissing, setDismissing] = useState(false);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLUListElement>(null);
  const roles = useMemo(() => [...new Map(items.map((i) => [i.roleId, i.roleTitle])).entries()], [items]);
  const count = (t: Tier) => items.filter((i) => (t === "all" || i.priority === t) && (!role || i.roleId === role)).length;

  useEffect(() => setDismissing(false), [current?.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const at = current ? shown.findIndex((i) => i.key === current.key) : -1;
      if (e.key === "j" || e.key === "ArrowDown") setSel(shown[Math.min(shown.length - 1, at + 1)]?.key ?? null);
      else if (e.key === "k" || e.key === "ArrowUp") setSel(shown[Math.max(0, at - 1)]?.key ?? null);
      else if (e.key === "Enter" && current && document.activeElement === document.body) router.push(current.action.href);
      else if (e.key === "d" && current) setDismissing(true);
      else if (e.key === "Escape") setDismissing(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, current, router]);

  useEffect(() => {
    list.current?.querySelector(`[data-key="${CSS.escape(current?.key ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current?.key]);

  const dismiss = (n: Item, reason: string) =>
    start(async () => {
      const r = await dismissNeed(n.key, n.type, reason);
      if (!r.ok) return setError(r.error);
      const at = shown.findIndex((i) => i.key === n.key);
      setSel(shown[at + 1]?.key ?? shown[at - 1]?.key ?? null);
      setDismissing(false);
      setOther("");
      setError(null);
      router.refresh();
    });

  const detail = (n: Item) => {
    const tierInfo = TIERS[n.priority] ?? TIERS[2];
    return (
      <div className="grid gap-5">
        <div className="flex items-start gap-3.5">
          <Glyph type={n.type} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`rounded-[4px] px-1.5 py-px text-[11px] font-semibold ${tierInfo.chip}`}>{tierInfo.tag}</span>
              <span className="text-slate">{tierInfo.label}</span>
            </div>
            <h2 className="mt-1.5 text-[18px] font-semibold leading-snug tracking-[-0.012em] text-ink">{n.text}</h2>
          </div>
        </div>

        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-y-2 border-y border-hairline py-3.5 text-[13px]">
          <dt className="text-slate">What</dt>
          <dd>{n.label}</dd>
          <dt className="text-slate">Role</dt>
          <dd>
            <Link href={`/console/roles/${n.roleId}`} className="hover:underline">
              {n.roleTitle}
            </Link>
          </dd>
          {n.person ? (
            <>
              <dt className="text-slate">Person</dt>
              <dd>{n.person}</dd>
            </>
          ) : null}
          <dt className="text-slate">Waiting</dt>
          <dd className={n.ageDays >= 7 ? "text-caution" : ""}>{ageLabel(n.ageDays)}</dd>
        </dl>

        <div>
          <h3 className="text-[12px] font-medium text-slate">Why this is here</h3>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-ink">{n.why}</p>
          {n.ageDays >= 7 && n.priority < 2 ? <p className="mt-2 text-[12.5px] text-slate">It moved up a tier because it has been waiting a week or more.</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={n.action.href} className={buttonClass("primary")}>
            {n.action.label}
          </Link>
          <Button onClick={() => setDismissing(!dismissing)} aria-expanded={dismissing}>
            Dismiss
          </Button>
          <span className="ml-auto hidden items-center gap-1.5 text-[12px] text-slate lg:flex">
            <Kbd>↵</Kbd> open <Kbd>d</Kbd> dismiss <Kbd>j</Kbd>
            <Kbd>k</Kbd> move
          </span>
        </div>

        {dismissing ? (
          <div className="grid gap-2 rounded-[8px] border border-hairline bg-mist/50 p-3">
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
              <input value={other} onChange={(e) => setOther(e.target.value)} aria-label="Another reason" placeholder="Another reason" className={`${fieldClass} h-9`} />
              <Button type="submit" size="sm" disabled={pending || !other.trim()}>
                Dismiss
              </Button>
            </form>
            {error ? (
              <p role="alert" className="text-[12.5px] text-alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.018em] text-ink">Needs you</h1>
          <p className="mt-1 text-[12.5px] text-slate">Everything across your roles that is waiting on a person, most blocking first.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Priority" className="inline-flex flex-wrap gap-0.5 rounded-[7px] bg-ink/[0.045] p-0.5">
          {(["all", 0, 1, 2] as Tier[]).map((t) => {
            const active = tier === t;
            const info = t === "all" ? null : TIERS[t];
            return (
              <button
                key={String(t)}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTier(t)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] transition-colors ${active ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(10_12_15/0.08),0_0_0_0.5px_rgb(10_12_15/0.06)]" : "text-slate hover:text-ink"}`}
              >
                {info ? <span className={`rounded-[3px] px-1 text-[10.5px] font-semibold ${info.chip}`}>{info.tag}</span> : null}
                {info ? <span className="max-sm:sr-only">{info.label}</span> : "All"}
                <span className="tabular-nums text-slate">{count(t)}</span>
              </button>
            );
          })}
        </div>
        {roles.length > 1 ? (
          <label>
            <span className="sr-only">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={smallFieldClass}>
              <option value="">All roles</option>
              {roles.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-[14px] font-semibold">You&rsquo;re all caught up</p>
          <p className="mt-1 text-[13px] text-slate">New replies, waiting candidates and anything else that needs a person will show up here.</p>
        </div>
      ) : (
        <div className="grid overflow-hidden rounded-[10px] border border-hairline lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
          <ul ref={list} aria-label="Items" className="max-h-none divide-y divide-hairline overflow-y-auto lg:max-h-[calc(100dvh-15rem)] lg:border-r lg:border-hairline">
            {shown.length === 0 ? <li className="px-4 py-10 text-center text-[13px] text-slate">Nothing here with these filters.</li> : null}
            {shown.map((n, i) => {
              const active = current?.key === n.key;
              const first = tier === "all" && (i === 0 || shown[i - 1].priority !== n.priority);
              const info = TIERS[n.priority] ?? TIERS[2];
              return (
                <li key={n.key} data-key={n.key}>
                  {first ? (
                    <div className="flex items-center gap-2 bg-mist/60 px-4 py-1.5 text-[11.5px]">
                      <span className={`rounded-[3px] px-1 text-[10.5px] font-semibold ${info.chip}`}>{info.tag}</span>
                      <span className="font-medium text-ink">{info.label}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSel(n.key)}
                    aria-current={active ? "true" : undefined}
                    className={`relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${active ? "bg-signal/[0.05]" : "hover:bg-mist/60"}`}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-signal" /> : null}
                    <Glyph type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-[13.5px] ${active ? "font-semibold" : "font-medium"} text-ink`}>{n.text}</span>
                        <span className={`shrink-0 text-[11.5px] tabular-nums ${n.ageDays >= 7 ? "text-caution" : "text-slate"}`}>{n.ageDays === 0 ? "today" : `${n.ageDays}d`}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-slate">
                        {n.label} · {n.roleTitle}
                      </span>
                    </span>
                  </button>
                  {active ? (
                    <div className="border-t border-hairline px-4 py-5 lg:hidden">
                      {detail(n)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <section aria-label="Selected item" className="hidden min-h-[26rem] p-6 lg:block xl:p-8">
            {current ? detail(current) : <p className="text-[13px] text-slate">Pick an item on the left.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
