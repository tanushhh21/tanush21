import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/console/context";
import { loadAnalytics, parseRange } from "@/lib/console/data/analytics";
import { NEED_LABEL, type NeedType } from "@/lib/console/needs";
import { BarList, Columns } from "@/components/console/charts";
import { Card, CardHead, Empty, buttonClass, smallFieldClass, tableClass, tdClass, thClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Insights" };

type A = Awaited<ReturnType<typeof loadAnalytics>>;

const rupees = (n: number | null) => (n == null ? "–" : `₹${n >= 100000 ? `${(n / 100000).toFixed(1)}L` : Math.round(n).toLocaleString("en-IN")}`);
const days = (n: number | null) => (n == null ? "–" : `${Math.round(n * 10) / 10}d`);
const versus = (v: number | null, base: number | null) => {
  if (v == null || base == null)
    return {
      text: base == null ? "No baseline yet" : `Your usual: ${days(base)}`,
      tone: "flat" as const,
    };
  const d = v - base;
  if (Math.abs(d) < 0.5)
    return {
      text: `In line with your usual ${days(base)}`,
      tone: "flat" as const,
    };
  return {
    text: `${days(Math.abs(d))} ${d < 0 ? "faster" : "slower"} than your usual`,
    tone: d < 0 ? ("good" as const) : ("bad" as const),
  };
};
const pct = (k: number, n: number) => (n ? Math.round((100 * k) / n) : 0);

/** Five views of one period. Overview answers "how are we doing"; the rest are where you go to find out why. */
const VIEWS = [
  { slug: "overview", label: "Overview" },
  { slug: "pipeline", label: "Pipeline" },
  { slug: "sources", label: "Sources & cost" },
  { slug: "quality", label: "Rubric quality" },
  { slug: "fairness", label: "Fairness" },
] as const;
type View = (typeof VIEWS)[number]["slug"];

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    days?: string;
    role?: string;
    view?: string;
  }>;
}) {
  const c = await requireCtx();
  const q = await searchParams;
  const range = parseRange(q);
  const a = await loadAnalytics(c, range);
  const view: View = (VIEWS.find((v) => v.slug === q.view)?.slug ?? "overview") as View;
  const filters = Object.entries(q).filter(([k, v]) => v && k !== "view") as [string, string][];
  const qs = new URLSearchParams(filters).toString();
  const hrefFor = (v: View) => `/console/analytics?${new URLSearchParams([...filters, ...(v === "overview" ? [] : [["view", v]])]).toString()}`.replace(/\?$/, "");
  const period =
    range.days === "all" ? "All time" : `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const flagged = a.fairness.some((f) => f.steps.some((s) => s.flagged));

  return (
    <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[12px] text-slate">{period}</p>
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.018em] text-ink">Insights</h1>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-[13px]" method="get">
          {view !== "overview" ? <input type="hidden" name="view" value={view} /> : null}
          <label>
            <span className="sr-only">Role</span>
            <select name="role" defaultValue={range.roleId ?? ""} className={smallFieldClass}>
              <option value="">All roles</option>
              {a.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Period</span>
            <select name="days" defaultValue={range.days} className={smallFieldClass}>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="all">All time</option>
              <option value="custom">Between dates</option>
            </select>
          </label>
          {range.days === "custom" ? (
            <>
              <label>
                <span className="sr-only">From</span>
                <input type="date" name="from" defaultValue={q.from ?? ""} className={smallFieldClass} />
              </label>
              <label>
                <span className="sr-only">To</span>
                <input type="date" name="to" defaultValue={q.to ?? ""} className={smallFieldClass} />
              </label>
            </>
          ) : null}
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Apply
          </button>
          <a href={`/api/console/export?what=analytics${qs ? `&${qs}` : ""}`} className={buttonClass("ghost", "sm")}>
            Export CSV
          </a>
        </form>
      </header>

      <nav aria-label="Insights" className="-mx-4 overflow-x-auto border-b border-hairline px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <ul className="-ml-2.5 flex gap-0.5">
          {VIEWS.map((v) => (
            <li key={v.slug}>
              <Link
                href={hrefFor(v.slug)}
                aria-current={view === v.slug ? "page" : undefined}
                className={`relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-[13px] transition-colors ${view === v.slug ? "font-medium text-ink" : "text-slate hover:text-ink"}`}
              >
                {v.label}
                {v.slug === "fairness" && flagged ? <span aria-label="has a flag" className="size-1.5 rounded-full bg-alert" /> : null}
                {view === v.slug ? <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {a.received === 0 ? (
        <Empty title="Nothing in this period">Pick a longer period or another role.</Empty>
      ) : view === "overview" ? (
        <Overview a={a} hrefFor={hrefFor} flagged={flagged} />
      ) : view === "pipeline" ? (
        <Pipeline a={a} />
      ) : view === "sources" ? (
        <Sources a={a} />
      ) : view === "quality" ? (
        <Quality a={a} />
      ) : (
        <Fairness a={a} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Overview */

function Overview({ a, hrefFor, flagged }: { a: A; hrefFor: (v: View) => string; flagged: boolean }) {
  const shortlisted = a.pipeline.find((p) => p.label === "Shortlisted")?.value ?? 0;
  const topSource = [...a.sources].sort((x, y) => y.shortlisted - x.shortlisted)[0];
  const t = a.time;
  return (
    <>
      <section aria-label="Key numbers" className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-hairline lg:grid-cols-4">
        <Kpi cell label="Applications" value={a.received.toLocaleString("en-IN")} sub={`${shortlisted} shortlisted · ${pct(shortlisted, a.received)}%`} />
        <Kpi cell label="Time to first shortlist" value={days(t.toShortlist.value)} delta={versus(t.toShortlist.value, t.toShortlist.baseline)} />
        <Kpi cell label="Time to offer" value={days(t.toOffer.value)} delta={versus(t.toOffer.value, t.toOffer.baseline)} />
        <Kpi cell label="Cost per hire" value={rupees(a.cost.perHire)} sub={`${rupees(a.cost.perShortlist)} per shortlist`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHead title="Applications per week" meta="Everyone who applied in the period, by the week they applied." />
          <div className="px-4 pb-3 pt-5 sm:px-5">
            <Columns
              data={a.weekly.map((w) => ({
                label: w.label,
                value: w.value,
                note: `${w.shortlisted} shortlisted`,
              }))}
              head={["Week of", "Applications"]}
              height={232}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Worth knowing" meta="What stands out in this period." />
          <ul className="divide-y divide-hairline">
            {a.rejections.headline ? <Highlight tone="caution" title="Top reason at screen" text={a.rejections.headline} href={hrefFor("pipeline")} /> : null}
            {topSource ? (
              <Highlight tone="signal" title="Best source" text={`${topSource.label} gave you ${topSource.shortlisted} shortlisted from ${topSource.produced} applications.`} href={hrefFor("sources")} />
            ) : null}
            <Highlight
              tone={a.accuracy.overrideRate != null && a.accuracy.overrideRate > 20 ? "caution" : "ok"}
              title="Rubric accuracy"
              text={a.accuracy.overrideRate == null ? "No decisions to compare yet." : `${a.accuracy.overrides} of ${a.accuracy.judged} decisions went against the band (${a.accuracy.overrideRate}%).`}
              href={hrefFor("quality")}
            />
            <Highlight
              tone={flagged ? "alert" : "ok"}
              title="Fairness"
              text={flagged ? "A group is passing through below four-fifths of the highest. Take a look." : "No group is below four-fifths of the highest where there are enough people to compare."}
              href={hrefFor("fairness")}
            />
          </ul>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Pipeline"
          meta="How many people reached each step, and the share that moved on from the step before."
          action={
            <Link href={hrefFor("pipeline")} className="text-[12.5px] text-slate hover:text-ink">
              Details
            </Link>
          }
        />
        <div className="px-4 py-5 sm:px-5">
          <FunnelSteps steps={a.pipeline} />
        </div>
      </Card>
    </>
  );
}

/** A number with its label and a line of context. `cell` draws the dividers of a 2-up (phone) / 4-up (desktop) strip. */
function Kpi({ label, value, sub, delta, cell }: { label: string; value: string; sub?: string; delta?: { text: string; tone: "good" | "bad" | "flat" }; cell?: boolean }) {
  const tone = delta?.tone === "good" ? "text-ok" : delta?.tone === "bad" ? "text-caution" : "text-slate";
  return (
    <div className={`min-w-0 px-4 py-4 sm:px-5 ${cell ? "border-hairline max-lg:[&:nth-child(-n+2)]:border-b max-lg:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r" : ""}`}>
      <p className="text-[12.5px] text-slate">{label}</p>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">{value}</p>
      <p className={`mt-2 text-[12px] ${delta ? tone : "text-slate"}`}>
        {delta && delta.tone !== "flat" ? <span aria-hidden="true">{delta.tone === "good" ? "↓ " : "↑ "}</span> : null}
        {delta ? delta.text : sub}
      </p>
    </div>
  );
}

function Highlight({ tone, title, text, href }: { tone: "ok" | "caution" | "alert" | "signal"; title: string; text: string; href: string }) {
  const dot = {
    ok: "bg-ok",
    caution: "bg-caution",
    alert: "bg-alert",
    signal: "bg-signal",
  }[tone];
  return (
    <li>
      <Link href={href} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-mist/60">
        <span aria-hidden="true" className={`mt-[7px] size-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-slate">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-[1.45] text-ink">{text}</span>
        </span>
        <svg viewBox="0 0 20 20" className="mt-1 size-3.5 shrink-0 text-slate/60 group-hover:text-ink" aria-hidden="true">
          <path d="m8 5.5 4.5 4.5L8 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

/** The funnel as steps: a column per stage, its height the share of everyone received, with the step-to-step conversion under it. */
function FunnelSteps({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <>
      <ol className="grid gap-2.5 sm:hidden" aria-label="Pipeline">
        {steps.map((s, i) => {
          const conv = i === 0 ? null : steps[i - 1].value ? pct(s.value, steps[i - 1].value) : null;
          return (
            <li key={s.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{s.label}</span>
                {conv == null ? null : <span className="block text-[11.5px] tabular-nums text-slate">{conv}% moved on</span>}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-ink/[0.05]" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-signal"
                  style={{
                    width: `${Math.max(s.value ? 2 : 0, (100 * s.value) / top)}%`,
                  }}
                />
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums">{s.value.toLocaleString("en-IN")}</span>
            </li>
          );
        })}
      </ol>
      <ol className="hidden grid-cols-[repeat(7,minmax(0,1fr))] gap-2 sm:grid" aria-label="Pipeline">
        {steps.map((s, i) => {
          const conv = i === 0 ? null : steps[i - 1].value ? pct(s.value, steps[i - 1].value) : null;
          return (
            <li key={s.label} className="min-w-0" aria-label={`${s.label}: ${s.value}${conv == null ? "" : `, ${conv}% of the step before`}`}>
              <div className="flex h-28 items-end sm:h-36" aria-hidden="true">
                <div
                  className="w-full rounded-t-[5px] bg-signal"
                  style={{
                    height: `${Math.max(s.value ? 3 : 0, (100 * s.value) / top)}%`,
                    opacity: 1 - i * 0.09,
                  }}
                />
              </div>
              <div className="border-t border-hairline pt-2" aria-hidden="true">
                <p className="text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink sm:text-[20px]">{s.value.toLocaleString("en-IN")}</p>
                <p className="mt-1 truncate text-[11.5px] text-slate sm:text-[12.5px]" title={s.label}>
                  {s.label}
                </p>
                <p className="mt-0.5 hidden text-[11.5px] tabular-nums text-slate/80 sm:block">{conv == null ? " " : `${conv}% moved on`}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate/80 sm:hidden">{conv == null ? " " : `${conv}%`}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Three numbers side by side on desktop, stacked on a phone. */
function Strip({
  label,
  items,
}: {
  label: string;
  items: {
    label: string;
    value: string;
    sub?: string;
    delta?: { text: string; tone: "good" | "bad" | "flat" };
  }[];
}) {
  return (
    <section aria-label={label} className="grid grid-cols-1 overflow-hidden rounded-[10px] border border-hairline sm:grid-cols-3">
      {items.map((k, i) => (
        <div key={k.label} className={`border-hairline ${i < items.length - 1 ? "max-sm:border-b sm:border-r" : ""}`}>
          <Kpi {...k} />
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ Pipeline */

function Pipeline({ a }: { a: A }) {
  const t = a.time;
  return (
    <>
      <Card>
        <CardHead title="Pipeline" meta="How many people reached each step, and the share that moved on from the step before." />
        <div className="px-4 py-5 sm:px-5">
          <FunnelSteps steps={a.pipeline} />
        </div>
      </Card>

      <div>
        <Strip
          label="Time"
          items={[
            {
              label: "Time to first shortlist",
              value: days(t.toShortlist.value),
              delta: versus(t.toShortlist.value, t.toShortlist.baseline),
            },
            {
              label: "Time to offer",
              value: days(t.toOffer.value),
              delta: versus(t.toOffer.value, t.toOffer.baseline),
            },
            {
              label: "Time to close",
              value: days(t.toClose.value),
              delta: versus(t.toClose.value, t.toClose.baseline),
            },
          ]}
        />
        <p className="mt-2 text-[12px] text-slate">Median days from opening the role, against your own roles, not an industry number.</p>
      </div>

      <Card>
        <CardHead
          title="Why candidates were rejected"
          meta={`${a.rejections.total} rejection${a.rejections.total === 1 ? "" : "s"} with a reason code, by the stage ${a.rejections.total === 1 ? "it was" : "they were"} made at.`}
        />
        <div className="grid gap-6 px-4 py-5 sm:px-5">
          {a.rejections.headline ? <p className="rounded-[8px] border border-hairline border-l-[3px] border-l-caution/70 px-3.5 py-2.5 text-[13.5px] font-medium">{a.rejections.headline}</p> : null}
          {a.rejections.total === 0 ? (
            <p className="text-[13.5px] text-slate">No rejections in this period.</p>
          ) : (
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-3">
              {a.rejections.byStage.map((s) => (
                <div key={s.stage}>
                  <h3 className="mb-3 flex items-baseline justify-between border-b border-hairline pb-2 text-[13px] font-medium">
                    {s.stage} <span className="text-[12px] font-normal tabular-nums text-slate">{s.total} rejected</span>
                  </h3>
                  {s.items.length ? (
                    <BarList
                      data={s.items.map((i) => ({
                        label: i.label,
                        value: Math.round((100 * i.value) / s.total),
                        note: `${i.value} of ${s.total}`,
                      }))}
                      max={100}
                      unit="%"
                      head={["Reason", "Share"]}
                    />
                  ) : (
                    <p className="text-[12.5px] text-slate">None.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {a.rejections.byRole.length > 1 ? (
          <div className="overflow-x-auto border-t border-hairline">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Role</th>
                  <th className={thClass}>Most common reasons</th>
                  <th className={`${thClass} text-right`}>Rejected</th>
                </tr>
              </thead>
              <tbody>
                {a.rejections.byRole.map((r) => (
                  <tr key={r.role}>
                    <td className={tdClass}>{r.role}</td>
                    <td className={`${tdClass} text-slate`}>
                      {r.items
                        .slice(0, 3)
                        .map((i) => `${i.label} (${Math.round((100 * i.value) / r.total)}%)`)
                        .join(", ")}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Sources and cost */

function Sources({ a }: { a: A }) {
  const most = Math.max(1, ...a.sources.map((s) => s.produced));
  return (
    <>
      <Card>
        <CardHead title="Sources" meta="Ranked by the people each one moved forward, never by volume. Costs come from each role's settings." />
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Source</th>
                <th className={`${thClass} min-w-[14rem]`}>Applications → shortlisted</th>
                <th className={`${thClass} text-right`}>Interviewed</th>
                <th className={`${thClass} text-right`}>Hired</th>
                <th className={`${thClass} text-right`}>Cost</th>
                <th className={`${thClass} text-right`}>Per shortlist</th>
                <th className={`${thClass} text-right`}>Per hire</th>
              </tr>
            </thead>
            <tbody>
              {a.sources.map((s) => (
                <tr key={s.label}>
                  <td className={`${tdClass} whitespace-nowrap font-medium`}>{s.label}</td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.05]" role="img" aria-label={`${s.produced} applications, ${s.shortlisted} shortlisted`}>
                        <div className="absolute inset-y-0 left-0 rounded-full bg-signal/25" style={{ width: `${(100 * s.produced) / most}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded-full bg-signal" style={{ width: `${(100 * s.shortlisted) / most}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-[12.5px] tabular-nums">
                        {s.produced} → {s.shortlisted}
                      </span>
                    </div>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{s.interviewed}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{s.hired}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{s.cost ? rupees(s.cost) : "–"}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{rupees(s.perShortlist)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{rupees(s.perHire)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-4 px-4 py-2.5 text-[12px] text-slate">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-3 rounded-full bg-signal/25" /> Applications
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-3 rounded-full bg-signal" /> Shortlisted
          </span>
        </p>
      </Card>

      <div className="grid gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Cost</h2>
          <p className="mt-0.5 text-[12.5px] text-slate">
            Model work plus what sources cost, in this period. Total {rupees(a.cost.totalInr)}: model {rupees(a.cost.modelInr)}, sources {rupees(a.cost.sourceInr)}.
          </p>
        </div>
        <section aria-label="Cost" className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-hairline lg:grid-cols-4">
          <Kpi cell label="Per candidate" value={rupees(a.cost.perCandidate)} sub="Each application read and scored" />
          <Kpi cell label="Per shortlist" value={rupees(a.cost.perShortlist)} sub="Each person you chose to meet" />
          <Kpi cell label="Per hire" value={rupees(a.cost.perHire)} sub="Each offer accepted" />
          <Kpi cell label="Per role" value={rupees(a.cost.perRole)} sub="Each role in this period" />
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Rubric quality */

function Quality({ a }: { a: A }) {
  const dismissed = Object.entries(
    a.dismissals.reduce<Record<string, { n: number; top: string }>>((m, d) => {
      const cur = m[d.type] ?? { n: 0, top: d.reason };
      m[d.type] = { n: cur.n + d.n, top: cur.top };
      return m;
    }, {}),
  )
    .map(([t, v]) => ({
      label: NEED_LABEL[t as NeedType] ?? t,
      value: v.n,
      note: `Most often: ${v.top}`,
    }))
    .sort((x, y) => y.value - x.value);
  return (
    <>
      <div className="grid gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">How accurate the rubric is</h2>
          <p className="mt-0.5 text-[12.5px] text-slate">Your own error rate, shown plainly.</p>
        </div>
        <Strip
          label="Accuracy"
          items={[
            {
              label: "Overridden",
              value: a.accuracy.overrideRate == null ? "–" : `${a.accuracy.overrideRate}%`,
              sub: `${a.accuracy.overrides} of ${a.accuracy.judged} decisions went against the band`,
            },
            {
              label: "Top-ranked was hired",
              value: a.accuracy.hires ? `${a.accuracy.topHired} of ${a.accuracy.hires}` : "–",
              sub: "Closed, filled roles",
            },
            {
              label: "Rejected late on a rubric point",
              value: a.accuracy.lateRejectRate == null ? "–" : `${a.accuracy.lateRejectRate}%`,
              sub: `${a.accuracy.lateRejects} shortlisted, then rejected on something the rubric covered`,
            },
          ]}
        />
      </div>

      <Card>
        <CardHead title="Blind re-rank" meta="On your closed roles: where Winnow placed the person you actually hired, against the order they arrived in." />
        {a.blind.rows.length === 0 ? (
          <p className="px-4 py-5 text-[13.5px] text-slate sm:px-5">Close a role as filled, naming who was hired, and it shows here.</p>
        ) : (
          <>
            <p className="px-4 pb-3 pt-4 text-[14px] sm:px-5">
              Winnow placed the hire in its top 10% on{" "}
              <span className="font-semibold">
                {a.blind.topDecile} of {a.blind.rows.length}
              </span>{" "}
              closed roles. In arrival order they were in the top 10% on {a.blind.theirTopDecile}.
            </p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Role</th>
                    <th className={thClass}>Hired</th>
                    <th className={`${thClass} text-right`}>Winnow</th>
                    <th className={`${thClass} text-right`}>Arrival order</th>
                  </tr>
                </thead>
                <tbody>
                  {a.blind.rows.map((h) => (
                    <tr key={h.role}>
                      <td className={tdClass}>{h.role}</td>
                      <td className={tdClass}>{h.hire}</td>
                      <td className={`${tdClass} text-right tabular-nums`}>{h.rank ? `#${h.rank} of ${h.n}` : "not scored"}</td>
                      <td className={`${tdClass} text-right tabular-nums`}>{h.arrivalPercentile != null ? `top ${100 - h.arrivalPercentile || 1}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {dismissed.length ? (
        <Card>
          <CardHead title="What people dismiss" meta="From the needs-you queue. An item everyone dismisses is an item that should not exist." />
          <div className="px-4 py-4 sm:px-5">
            <BarList data={dismissed} head={["Item", "Dismissed"]} />
          </div>
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ Fairness */

function Fairness({ a }: { a: A }) {
  return (
    <>
      <p className="max-w-[52rem] text-[13px] leading-[1.55] text-slate">
        Pass-through at each stage across attributes that were removed before scoring. They leak through other things a CV says, so this is checked, not assumed. A group is flagged when its rate is under four-fifths of
        the highest, with at least 10 people in each group.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {a.fairness.map((f) => (
          <Card key={f.attr}>
            <CardHead title={f.attr} meta={`Stated on ${f.stated} of ${a.received} applications. Never inferred from a name or a photo.`} />
            <div className="grid gap-5 px-4 py-4 sm:px-5">
              {f.steps.map((s) => (
                <div key={s.step}>
                  <p className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <span className="font-medium text-ink">{s.step}</span>
                    {s.flagged ? (
                      <span className="rounded-[5px] bg-alert/[0.08] px-1.5 text-[12px] font-medium text-alert">▲ Below four-fifths</span>
                    ) : !s.enough ? (
                      <span className="text-[12px] text-slate">Too few people to compare</span>
                    ) : (
                      <span className="rounded-[5px] bg-ok/[0.08] px-1.5 text-[12px] font-medium text-ok">✓ Within four-fifths</span>
                    )}
                  </p>
                  <table className={`${tableClass} table-fixed`}>
                    <tbody>
                      {s.rows.map((r) => (
                        <tr key={r.group}>
                          <td className="w-[28%] truncate border-b border-hairline py-1.5 pr-3 text-[13px]">{r.group}</td>
                          <td className="w-[38%] border-b border-hairline px-3 py-1.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.05]" aria-hidden="true">
                              <div
                                className={`h-full rounded-full ${r.ratio != null && r.ratio < 0.8 ? "bg-alert" : "bg-signal/70"}`}
                                style={{
                                  width: `${Math.round((r.rate ?? 0) * 100)}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="border-b border-hairline px-2 py-1.5 text-right text-[12.5px] tabular-nums text-slate">
                            {r.passed}/{r.n}
                          </td>
                          <td className="border-b border-hairline px-2 py-1.5 text-right text-[12.5px] tabular-nums">{r.rate == null ? "–" : `${Math.round(r.rate * 100)}%`}</td>
                          <td className={`border-b border-hairline py-1.5 pl-2 text-right text-[12.5px] tabular-nums ${r.ratio != null && r.ratio < 0.8 ? "text-alert" : "text-slate"}`}>
                            {r.ratio == null ? "" : `${r.ratio.toFixed(2)}×`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
