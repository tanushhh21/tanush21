import type { Metadata } from "next";
import { requireCtx } from "@/lib/console/context";
import { loadAnalytics, parseRange } from "@/lib/console/data/analytics";
import { NEED_LABEL, type NeedType } from "@/lib/console/needs";
import { BarList, Funnel } from "@/components/console/charts";
import { Card, CardHead, Empty, PageHeader, Stat, buttonClass, smallFieldClass, tableClass, tdClass, thClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Insights" };

const rupees = (n: number | null) => (n == null ? "–" : `₹${n >= 100000 ? `${(n / 100000).toFixed(1)}L` : Math.round(n).toLocaleString("en-IN")}`);
const days = (n: number | null) => (n == null ? "–" : `${Math.round(n * 10) / 10}d`);
const versus = (v: number | null, base: number | null) => {
  if (v == null || base == null) return base == null ? "No baseline yet" : `Your usual: ${days(base)}`;
  const d = v - base;
  return Math.abs(d) < 0.5 ? `In line with your usual ${days(base)}` : `${d < 0 ? "Faster" : "Slower"} than your usual ${days(base)}`;
};

export default async function Analytics({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; days?: string; role?: string }> }) {
  const c = await requireCtx();
  const q = await searchParams;
  const range = parseRange(q);
  const a = await loadAnalytics(c, range);
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Insights"
        meta={`${a.received.toLocaleString("en-IN")} applications ${range.days === "all" ? "all time" : `from ${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} to ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}`}
        actions={
          <a href={`/api/console/export?what=analytics${qs ? `&${qs}` : ""}`} className={buttonClass("ghost", "sm")}>
            Export CSV
          </a>
        }
      />
      <form className="flex flex-wrap items-end gap-2 text-[13px]" method="get">
        <label>
          <span className="block text-[12px] text-slate">Role</span>
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
          <span className="block text-[12px] text-slate">Period</span>
          <select name="days" defaultValue={range.days} className={smallFieldClass}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="all">All time</option>
            <option value="custom">Between dates</option>
          </select>
        </label>
        <label>
          <span className="block text-[12px] text-slate">From</span>
          <input type="date" name="from" defaultValue={q.from ?? ""} className={smallFieldClass} />
        </label>
        <label>
          <span className="block text-[12px] text-slate">To</span>
          <input type="date" name="to" defaultValue={q.to ?? ""} className={smallFieldClass} />
        </label>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Apply
        </button>
      </form>

      {a.received === 0 ? (
        <Empty title="Nothing in this period">Pick a longer period or another role.</Empty>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="Pipeline" meta="With the conversion from each step to the next." />
              <div className="px-4 py-4 sm:px-5">
                <Funnel steps={a.pipeline} />
              </div>
            </Card>
            <Card>
              <CardHead title="Time" meta="Median days from opening the role, against your own roles, not an industry number." />
              <div className="grid gap-5 px-4 py-4 sm:grid-cols-3 sm:px-5">
                <Stat label="To first shortlist" value={days(a.time.toShortlist.value)} sub={versus(a.time.toShortlist.value, a.time.toShortlist.baseline)} />
                <Stat label="To offer" value={days(a.time.toOffer.value)} sub={versus(a.time.toOffer.value, a.time.toOffer.baseline)} />
                <Stat label="To close" value={days(a.time.toClose.value)} sub={versus(a.time.toClose.value, a.time.toClose.baseline)} />
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Why candidates were rejected" meta={`${a.rejections.total} rejection${a.rejections.total === 1 ? "" : "s"} with a reason code, by the stage ${a.rejections.total === 1 ? "it was" : "they were"} made at.`} />
            <div className="grid gap-5 px-4 py-4 sm:px-5">
              {a.rejections.headline ? <p className="font-display text-[18px] font-semibold tracking-[-0.01em]">{a.rejections.headline}</p> : null}
              {a.rejections.total === 0 ? (
                <p className="text-[13.5px] text-slate">No rejections in this period.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                  {a.rejections.byStage.map((s) => (
                    <div key={s.stage}>
                      <h3 className="mb-2 text-[13px] font-medium">
                        {s.stage} <span className="font-mono text-slate tabular-nums">{s.total}</span>
                      </h3>
                      {s.items.length ? (
                        <BarList data={s.items.map((i) => ({ label: i.label, value: Math.round((100 * i.value) / s.total), note: `${i.value} of ${s.total}` }))} max={100} unit="%" head={["Reason", "Share"]} />
                      ) : (
                        <p className="text-[12.5px] text-slate">None.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {a.rejections.byRole.length > 1 ? (
                <div className="overflow-x-auto">
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
                          <td className={tdClass}>{r.items.slice(0, 3).map((i) => `${i.label} (${Math.round((100 * i.value) / r.total)}%)`).join(", ")}</td>
                          <td className={`${tdClass} text-right font-mono tabular-nums`}>{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Sources" meta="Ranked by the people each one moved forward, never by volume. Costs come from each role's settings." />
            <div className="overflow-x-auto px-1 pb-2">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Source</th>
                    <th className={`${thClass} text-right`}>Produced</th>
                    <th className={`${thClass} text-right`}>Shortlisted</th>
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
                      <td className={tdClass}>{s.label}</td>
                      {[s.produced, s.shortlisted, s.interviewed, s.hired].map((v, i) => (
                        <td key={i} className={`${tdClass} text-right font-mono tabular-nums`}>
                          {v}
                        </td>
                      ))}
                      <td className={`${tdClass} text-right font-mono tabular-nums`}>{s.cost ? rupees(s.cost) : "–"}</td>
                      <td className={`${tdClass} text-right font-mono tabular-nums`}>{rupees(s.perShortlist)}</td>
                      <td className={`${tdClass} text-right font-mono tabular-nums`}>{rupees(s.perHire)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="How accurate the rubric is" meta="Your own error rate, shown plainly." />
              <div className="grid gap-5 px-4 py-4 sm:grid-cols-3 sm:px-5">
                <Stat label="Overridden" value={a.accuracy.overrideRate == null ? "–" : `${a.accuracy.overrideRate}%`} sub={`${a.accuracy.overrides} of ${a.accuracy.judged} decisions went against the band`} />
                <Stat label="Top-ranked was hired" value={a.accuracy.hires ? `${a.accuracy.topHired} of ${a.accuracy.hires}` : "–"} sub="Closed, filled roles" />
                <Stat label="Rejected late on a rubric point" value={a.accuracy.lateRejectRate == null ? "–" : `${a.accuracy.lateRejectRate}%`} sub={`${a.accuracy.lateRejects} shortlisted, then rejected on something the rubric covered`} />
              </div>
            </Card>
            <Card>
              <CardHead title="Blind re-rank" meta="On your closed roles: where Winnow placed the person you actually hired, against the order they arrived in." />
              <div className="px-4 py-4 sm:px-5">
                {a.blind.rows.length === 0 ? (
                  <p className="text-[13.5px] text-slate">Close a role as filled, naming who was hired, and it shows here.</p>
                ) : (
                  <>
                    <p className="mb-3 text-[14px]">
                      Winnow placed the hire in its top 10% on <span className="font-semibold">{a.blind.topDecile} of {a.blind.rows.length}</span> closed roles. In arrival order they were in the top 10% on {a.blind.theirTopDecile}.
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
                              <td className={`${tdClass} text-right font-mono tabular-nums`}>{h.rank ? `#${h.rank} of ${h.n}` : "not scored"}</td>
                              <td className={`${tdClass} text-right font-mono tabular-nums`}>{h.arrivalPercentile != null ? `top ${100 - h.arrivalPercentile || 1}%` : "–"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Cost" meta="Model work plus what sources cost, in this period." />
            <div className="grid gap-5 px-4 py-4 sm:grid-cols-4 sm:px-5">
              <Stat label="Per candidate" value={rupees(a.cost.perCandidate)} />
              <Stat label="Per shortlist" value={rupees(a.cost.perShortlist)} />
              <Stat label="Per hire" value={rupees(a.cost.perHire)} />
              <Stat label="Per role" value={rupees(a.cost.perRole)} sub={`Total ${rupees(a.cost.totalInr)}: model ${rupees(a.cost.modelInr)}, sources ${rupees(a.cost.sourceInr)}`} />
            </div>
          </Card>

          <Card>
            <CardHead
              title="Fairness"
              meta="Pass-through at each stage across attributes that were removed before scoring. They leak through other things a CV says, so this is checked, not assumed. A group is flagged when its rate is under four-fifths of the highest, with at least 10 people in each group."
            />
            <div className="grid gap-6 px-4 py-4 sm:px-5 lg:grid-cols-2">
              {a.fairness.map((f) => (
                <div key={f.attr}>
                  <h3 className="text-[13px] font-medium">{f.attr}</h3>
                  <p className="mb-2 text-[12px] text-slate">Stated on {f.stated} of {a.received} applications. Never inferred from a name or a photo.</p>
                  {f.steps.map((s) => (
                    <div key={s.step} className="mb-3">
                      <p className="mb-1 text-[12.5px] text-slate">
                        {s.step}
                        {s.flagged ? <span className="ml-2 font-medium text-alert">▲ Below four-fifths</span> : !s.enough ? <span className="ml-2">· too few people to compare</span> : <span className="ml-2 text-ok">✓ Within four-fifths</span>}
                      </p>
                      <table className={tableClass}>
                        <tbody>
                          {s.rows.map((r) => (
                            <tr key={r.group}>
                              <td className="border-b border-hairline py-1.5 pr-3 text-[13px]">{r.group}</td>
                              <td className="border-b border-hairline px-3 py-1.5 text-right font-mono text-[12.5px] tabular-nums">
                                {r.passed}/{r.n}
                              </td>
                              <td className="border-b border-hairline px-3 py-1.5 text-right font-mono text-[12.5px] tabular-nums">{r.rate == null ? "–" : `${Math.round(r.rate * 100)}%`}</td>
                              <td className={`border-b border-hairline py-1.5 pl-3 text-right font-mono text-[12.5px] tabular-nums ${r.ratio != null && r.ratio < 0.8 ? "text-alert" : "text-slate"}`}>
                                {r.ratio == null ? "" : `${r.ratio.toFixed(2)}×`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          {a.dismissals.length ? (
            <Card>
              <CardHead title="What people dismiss" meta="From the needs-you queue. An item everyone dismisses is an item that should not exist." />
              <div className="px-4 py-4 sm:px-5">
                <BarList
                  data={Object.entries(
                    a.dismissals.reduce<Record<string, { n: number; top: string }>>((m, d) => {
                      const cur = m[d.type] ?? { n: 0, top: d.reason };
                      m[d.type] = { n: cur.n + d.n, top: cur.top };
                      return m;
                    }, {}),
                  )
                    .map(([t, v]) => ({ label: NEED_LABEL[t as NeedType] ?? t, value: v.n, note: `Most often: ${v.top}` }))
                    .sort((x, y) => y.value - x.value)}
                  head={["Item", "Dismissed"]}
                />
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
