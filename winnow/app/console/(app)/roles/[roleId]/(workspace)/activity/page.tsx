import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx, requireRole } from "@/lib/console/context";
import { costByStage, isFailure, loadActivity, type Filter } from "@/lib/console/data/activity";
import { USD_INR, rupeesFromUsd, usd } from "@/lib/console/money";
import { BarList } from "@/components/console/charts";
import { InsightViews } from "@/components/console/roles/Views";
import { Card, CardHead, Empty, buttonClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "History" };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "winnow", label: "Winnow's work" },
  { id: "people", label: "People" },
  { id: "failures", label: "Failures" },
];

const dayOf = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
const timeOf = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export default async function Activity({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ show?: string; before?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const q = await searchParams;
  const show = (FILTERS.find((f) => f.id === q.show)?.id ?? "all") as Filter;
  const before = q.before && !Number.isNaN(Date.parse(q.before)) ? new Date(q.before) : undefined;
  const [rows, cost] = await Promise.all([loadActivity(role.id, show, before), costByStage(role.id)]);
  const base = `/console/roles/${role.id}/activity`;
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayOf(r.at);
    days.set(k, [...(days.get(k) ?? []), r]);
  }

  return (
    <div className="grid gap-4">
      <InsightViews roleId={role.id} active="history" />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Show" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={f.id === "all" ? base : `${base}?show=${f.id}`}
                aria-current={show === f.id ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-[13px] ${show === f.id ? "bg-ink text-paper" : "text-slate hover:bg-mist hover:text-ink"}`}
              >
                {f.label}
                {f.id === "failures" && cost.failures ? <span className="ml-1.5 font-mono tabular-nums">{cost.failures}</span> : null}
              </Link>
            ))}
          </nav>
          <a href={`/api/console/export?what=activity&roleId=${role.id}`} className={buttonClass("ghost", "sm")}>
            Export CSV
          </a>
        </div>
        {rows.length === 0 ? (
          <Empty title={show === "failures" ? "Nothing has failed" : "Nothing yet"}>{show === "failures" ? "Unreadable files and failed steps would show here." : "Everything that happens on this role is recorded here."}</Empty>
        ) : (
          <>
            {[...days.entries()].map(([day, list]) => (
              <section key={day}>
                <h2 className="sticky top-14 z-[1] bg-paper/95 py-1.5 text-[12px] font-medium text-slate backdrop-blur lg:top-0">{day}</h2>
                <ol className="grid">
                  {list.map((r) => (
                    <li key={r.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-3 border-b border-hairline py-2 text-[13.5px]">
                      <time dateTime={r.at.toISOString()} className="font-mono text-[12px] tabular-nums text-slate">
                        {timeOf(r.at)}
                      </time>
                      <span className={isFailure(r.kind) ? "text-alert" : ""}>
                        {r.message}
                        <span className="text-slate"> · {r.actor ?? r.actorEmail ?? "Winnow"}</span>
                        {typeof r.detail?.applicationId === "string" ? (
                          <Link href={`/console/c/${r.detail.applicationId}`} className="ml-1.5 text-signal hover:underline">
                            Open
                          </Link>
                        ) : null}
                      </span>
                      <span className="text-right font-mono text-[12px] tabular-nums text-slate" title={r.costUsd ? usd(r.costUsd) : undefined}>
                        {r.costUsd ? rupeesFromUsd(r.costUsd) : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            {rows.length === 200 ? (
              <div>
                <Link href={`${base}?${new URLSearchParams({ ...(show !== "all" ? { show } : {}), before: rows[rows.length - 1].at.toISOString() })}`} className={buttonClass("secondary", "sm")}>
                  Older
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
      <aside className="grid gap-4">
        <Card>
          <CardHead title="What Winnow's work cost" meta={`Model usage on this role, at ₹${USD_INR} to the dollar.`} />
          <div className="px-4 pb-4">
            <p className="font-display text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{rupeesFromUsd(cost.total)}</p>
            <p className="mb-4 text-[12.5px] text-slate">{usd(cost.total)} in total</p>
            {cost.stages.length ? (
              <BarList data={cost.stages.map((s) => ({ label: s.label, value: Math.round(s.cost * USD_INR * 100) / 100, note: `${s.n} step${s.n === 1 ? "" : "s"}` }))} fmt="rupees" head={["Stage", "Cost"]} />
            ) : (
              <p className="text-[13px] text-slate">No model work yet.</p>
            )}
          </div>
        </Card>
        {cost.failedJobs ? (
          <Card>
            <CardHead title="Steps that failed" />
            <p className="px-4 pb-4 text-[13px]">
              {cost.failedJobs} step{cost.failedJobs === 1 ? "" : "s"} failed after retrying.{" "}
              <Link href={`${base}?show=failures`} className="text-signal hover:underline">
                See which
              </Link>
            </p>
          </Card>
        ) : null}
      </aside>
    </div>
    </div>
  );
}
