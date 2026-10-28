import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { roleSources } from "@/lib/db/schema";
import { requireCtx, requireRole } from "@/lib/console/context";
import { loadRanking } from "@/lib/console/data/ranking";
import { Card, CardHead, Empty, inr } from "@/components/console/ui";
import { BarList, Columns, Funnel } from "@/components/console/charts";
import { SOURCE_LABEL } from "@/components/console/ranking/model";

export const metadata: Metadata = { title: "Pool" };

/** The screen that says the search is wrong rather than the candidates. */
export default async function Pool({ params }: { params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const { requirements, rows } = await loadRanking(role.id, role.rubricVersion);
  const scored = rows.filter((r) => r.status === "done");
  if (scored.length === 0) return <Empty title="No pool yet">Coverage, sources and pay appear once candidates are scored.</Empty>;
  const n = scored.length;

  // Coverage per requirement, and what is missing.
  const coverage = requirements.map((q) => {
    const known = scored.filter((r) => (r.verdicts[q.key] ?? "unknown") !== "unknown").length;
    const met = scored.filter((r) => r.verdicts[q.key] === "met").length;
    return { q, known, met };
  });
  const missing: string[] = [];
  for (const cv of coverage) {
    if (cv.known / n < 0.1) missing.push(`${Math.round(100 - (100 * cv.known) / n)}% of candidates say nothing about “${cv.q.text}”. Either it is worded so CVs never mention it, or it is absent from this pool.`);
    else if (cv.met / n < 0.1) missing.push(`Almost nobody here has “${cv.q.text}” (${cv.met} of ${n}). If it matters, the search is wrong, not the candidates.`);
  }

  // Concentration among the top twenty.
  const top20 = scored.filter((r) => r.rank != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, 20);
  const byCompany = new Map<string, number>();
  for (const r of top20) {
    const co = r.facts.current_company?.v;
    if (co) byCompany.set(co, (byCompany.get(co) ?? 0) + 1);
  }
  const companies = [...byCompany].sort((a, b) => b[1] - a[1]);
  const top3 = companies.slice(0, 3);
  const top3n = top3.reduce((s, [, k]) => s + k, 0);
  const concentrated = top20.length >= 8 && top3n / top20.length >= 0.5;

  // Sources: produced, advanced, cost.
  const sources = await db.select().from(roleSources).where(eq(roleSources.roleId, role.id));
  const advanced = (r: (typeof rows)[number]) => r.decision === "shortlisted" || ["interviewing", "offer", "hired"].includes(r.stage);
  const sourceRows = [...new Set(rows.map((r) => r.source))]
    .map((s) => {
      const mine = rows.filter((r) => r.source === s);
      const cost = sources.filter((x) => x.kind === s).reduce((t, x) => t + x.costInr, 0);
      const adv = mine.filter(advanced).length;
      return { s, produced: mine.length, advanced: adv, cost, per: adv ? Math.round(cost / adv) : null };
    })
    .sort((a, b) => b.advanced - a.advanced || b.produced - a.produced);

  // Compensation reality: expected CTC against the band, in ₹4L buckets.
  const ctc = scored.map((r) => r.facts.expected_ctc?.n).filter((v): v is number => v != null && v > 0);
  const step = 400000;
  const lo = Math.max(0, Math.floor(Math.min(...ctc, role.compMin ?? Infinity) / step) * step);
  const hi = Math.ceil(Math.max(...ctc, role.compMax ?? 0) / step) * step;
  const buckets = ctc.length ? Array.from({ length: Math.max(1, (hi - lo) / step) }, (_, i) => lo + i * step) : [];
  const ctcData = buckets.map((b) => ({ label: `${Math.round(b / 100000)}L`, value: ctc.filter((v) => v >= b && v < b + step).length }));
  const band = role.compMin != null && role.compMax != null && buckets.length ? { from: Math.max(0, (role.compMin - lo) / step), to: Math.min(buckets.length, (role.compMax - lo) / step), label: "Your band" } : undefined;
  const above = role.compMax != null ? ctc.filter((v) => v > role.compMax!).length : 0;

  // Notice periods against the target date.
  const daysLeft = role.targetDate ? Math.round((new Date(role.targetDate).getTime() - Date.now()) / 86_400_000) : null;
  const notice = scored.map((r) => r.facts.notice_period_days?.n).filter((v): v is number => v != null);
  const NB = [
    { label: "Immediate", test: (d: number) => d === 0 },
    { label: "Up to 15 days", test: (d: number) => d > 0 && d <= 15 },
    { label: "16–30 days", test: (d: number) => d > 15 && d <= 30 },
    { label: "31–60 days", test: (d: number) => d > 30 && d <= 60 },
    { label: "61–90 days", test: (d: number) => d > 60 && d <= 90 },
    { label: "Over 90 days", test: (d: number) => d > 90 },
  ];
  const canMake = daysLeft != null ? notice.filter((d) => d <= daysLeft - 21).length : null;

  // Funnel.
  const stageAtLeast = (st: string[]) => rows.filter((r) => st.includes(r.stage)).length;
  const funnel = [
    { label: "Received", value: rows.length },
    { label: "Read", value: rows.filter((r) => r.status !== "unreadable" && r.status !== "reading").length },
    { label: "Scored", value: n },
    { label: "Above the bar", value: scored.filter((r) => r.band !== "below_bar").length },
    { label: "Shortlisted", value: rows.filter((r) => r.decision === "shortlisted" || ["interviewing", "offer", "hired"].includes(r.stage)).length },
    { label: "Interviewing", value: stageAtLeast(["interviewing", "offer", "hired"]) },
    { label: "Offer", value: stageAtLeast(["offer", "hired"]) },
    { label: "Hired", value: stageAtLeast(["hired"]) },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHead title="What is missing" meta={`Read from ${n} scored candidates`} />
        <div className="grid gap-2 px-5 py-4 text-[14px]">
          {missing.length || concentrated ? null : <p className="text-slate">Nothing stands out: every requirement has evidence in this pool.</p>}
          {missing.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
          {concentrated ? (
            <p>
              {top3n} of the top {top20.length} come from {top3.length} compan{top3.length === 1 ? "y" : "ies"} ({top3.map(([k]) => k).join(", ")}). The job description is probably written in their vocabulary.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHead title="Coverage per requirement" meta="How many candidates have any evidence at all" />
        <div className="px-5 py-4">
          <BarList data={coverage.map((cv) => ({ label: cv.q.text, value: Math.round((100 * cv.known) / n), note: `${cv.met} met` }))} max={100} unit="%" head={["Requirement", "With evidence"]} />
        </div>
      </Card>

      <Card>
        <CardHead title="Funnel" meta="This role, all time" />
        <div className="px-5 py-4">
          <Funnel steps={funnel} />
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHead title="Sources" meta="Ranked by people who advanced, never by volume" />
        <div className="overflow-x-auto px-5 py-3">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-slate">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 text-right font-medium">Candidates</th>
                <th className="py-2 text-right font-medium">Reached the shortlist</th>
                <th className="py-2 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Cost per shortlisted</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((s) => (
                <tr key={s.s} className="border-t border-hairline">
                  <td className="py-2">{SOURCE_LABEL[s.s] ?? s.s}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{s.produced}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{s.advanced}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{s.cost ? inr(s.cost) : "–"}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{s.per != null ? inr(s.per) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-slate">Set what each source costs in the role&rsquo;s settings to see cost per shortlisted candidate.</p>
        </div>
      </Card>

      <Card>
        <CardHead title="Compensation reality" meta={role.compMax ? `Expected CTC against the band (${inr(role.compMin)}–${inr(role.compMax)})` : "Expected CTC (set a band in settings to compare)"} />
        <div className="px-5 py-4">
          {ctc.length ? (
            <>
              <Columns data={ctcData} highlight={band} head={["Expected CTC from", "Candidates"]} />
              {role.compMax && above / ctc.length >= 0.4 ? (
                <p className="mt-3 text-[13.5px]">
                  <span className="font-medium">{Math.round((100 * above) / ctc.length)}% expect more than the top of the band.</span> The band is probably below the market for this role, the most common reason a
                  pipeline fails without anyone noticing for a month.
                </p>
              ) : (
                <p className="mt-3 text-[13px] text-slate">
                  {above} of {ctc.length} who stated it expect more than the band&rsquo;s top.
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-slate">Nobody has stated an expected CTC yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Notice periods" meta={daysLeft != null ? `${daysLeft} days to the target date` : "Set a target date to compare"} />
        <div className="px-5 py-4">
          {notice.length ? (
            <>
              <BarList data={NB.map((b) => ({ label: b.label, value: notice.filter(b.test).length }))} head={["Notice period", "Candidates"]} />
              {canMake != null ? (
                <p className="mt-3 text-[13px]">
                  {canMake} of {notice.length} could join before the target date, allowing three weeks to decide and offer.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-slate">Nobody has stated a notice period yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
