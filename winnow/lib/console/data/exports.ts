/**
 * Org-level CSV exports. Each one checks the same permissions as the screen
 * it comes from; the export route writes every export to the audit log.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationFacts, applications, companyFacts, documents, evaluations, interviews, debriefs, notes, persons, roles, rubricVersions, requirements, verdicts } from "@/lib/db/schema";
import { can, visibleRoles, type Ctx } from "@/lib/console/context";
import { summarizeRoles } from "@/lib/console/roles";
import { describe, loadAudit, parseAudit } from "@/lib/console/data/audit";
import { loadAnalytics, parseRange } from "@/lib/console/data/analytics";

type Cell = string | number | null | undefined;
type Out = { name: string; rows: Cell[][]; json?: unknown } | null;

export const exporters: Record<string, (c: Ctx, q: URLSearchParams) => Promise<Out>> = {
  roles: async (c) => {
    const rs = await summarizeRoles(c, { includeClosed: true });
    return {
      name: "Roles",
      rows: [
        ["Role", "Hiring manager", "Status", "Days open", "Received", "Scored", "Failed to score", "Unreadable", "Shortlisted", "Target date", "Risk"],
        ...rs.map((r) => [r.title, r.hiringManager, r.status, r.daysOpen, r.received, r.scored, r.failed, r.unreadable, r.shortlisted, r.targetDate, r.risk]),
      ],
    };
  },
  audit: async (c, q) => {
    const rows = await loadAudit(c, parseAudit(Object.fromEntries(q.entries())), 50_000);
    return {
      name: "Audit",
      rows: [
        ["When (UTC)", "Who", "What", "Candidate", "Role", "Rubric version", "Reason code", "Stage", "Score then", "Rank then", "Band then", "Note"],
        ...rows.map((r) => {
          const d = r.detail as { reasonCode?: string; stage?: string; note?: string; evaluation?: { score?: number; rank?: number; band?: string } };
          return [r.at.toISOString(), r.actor ?? r.actorEmail ?? "Winnow", describe(r.action), r.candidate, r.role, r.version, d.reasonCode, d.stage, d.evaluation?.score, d.evaluation?.rank, d.evaluation?.band, d.note];
        }),
      ],
    };
  },
  analytics: async (c, q) => {
    const a = await loadAnalytics(c, parseRange(Object.fromEntries(q.entries())));
    const rows: Cell[][] = [["Section", "Item", "Value", "Detail"]];
    for (const p of a.pipeline) rows.push(["Pipeline", p.label, p.value, ""]);
    for (const [k, v] of Object.entries(a.time)) rows.push(["Time (median days)", k, v.value == null ? "" : Math.round(v.value * 10) / 10, v.baseline == null ? "" : `baseline ${Math.round(v.baseline * 10) / 10}`]);
    for (const s of a.rejections.byStage) for (const i of s.items) rows.push(["Rejections", `${s.stage}: ${i.label}`, i.value, `${Math.round((100 * i.value) / s.total)}%`]);
    for (const s of a.sources) rows.push(["Sources", s.label, s.produced, `shortlisted ${s.shortlisted}, interviewed ${s.interviewed}, hired ${s.hired}, cost ₹${s.cost}`]);
    rows.push(["Rubric accuracy", "Override rate", a.accuracy.overrideRate ?? "", `${a.accuracy.overrides} of ${a.accuracy.judged}`]);
    rows.push(["Rubric accuracy", "Top-ranked hired", a.accuracy.topHired, `of ${a.accuracy.hires}`]);
    for (const h of a.blind.rows) rows.push(["Blind re-rank", h.role, h.rank ?? "", `${h.hire}, Winnow percentile ${h.percentile ?? "–"}, arrival percentile ${h.arrivalPercentile ?? "–"}`]);
    rows.push(["Cost (₹)", "Per candidate", a.cost.perCandidate == null ? "" : Math.round(a.cost.perCandidate), ""], ["Cost (₹)", "Per hire", a.cost.perHire == null ? "" : Math.round(a.cost.perHire), ""]);
    for (const f of a.fairness) for (const s of f.steps) for (const r of s.rows) rows.push([`Fairness: ${f.attr}`, `${s.step}: ${r.group}`, r.rate == null ? "" : Math.round(r.rate * 100), `${r.passed}/${r.n}${r.ratio != null ? `, ratio ${r.ratio.toFixed(2)}` : ""}`]);
    return { name: "Analytics", rows };
  },
  /** Everything the organisation holds, as JSON: admins only. */
  everything: async (c) => {
    if (!can.dataSettings(c)) return null;
    const rs = await db.select().from(roles).where(and(eq(roles.orgId, c.org.id), visibleRoles(c)));
    const ids = rs.map((r) => r.id);
    const none = ["00000000-0000-0000-0000-000000000000"];
    const apps = await db.select().from(applications).where(inArray(applications.roleId, ids.length ? ids : none));
    const appIds = apps.map((a) => a.id).length ? apps.map((a) => a.id) : none;
    const versions = await db.select().from(rubricVersions).where(inArray(rubricVersions.roleId, ids.length ? ids : none));
    const json = {
      exportedAt: new Date().toISOString(),
      organisation: c.org.name,
      roles: rs,
      rubricVersions: versions,
      requirements: versions.length ? await db.select().from(requirements).where(inArray(requirements.rubricVersionId, versions.map((v) => v.id))) : [],
      people: await db.select().from(persons).where(eq(persons.orgId, c.org.id)),
      applications: apps,
      facts: await db.select().from(applicationFacts).where(inArray(applicationFacts.applicationId, appIds)),
      documents: (await db.select().from(documents).where(eq(documents.orgId, c.org.id))).map(({ text, ...d }) => ({ ...d, textLength: text?.length ?? 0 })),
      evaluations: await db.select().from(evaluations).where(inArray(evaluations.applicationId, appIds)),
      verdicts: await db.select().from(verdicts).innerJoin(evaluations, eq(evaluations.id, verdicts.evaluationId)).where(inArray(evaluations.applicationId, appIds)).then((r) => r.map((x) => x.verdict)),
      interviews: await db.select().from(interviews).where(inArray(interviews.applicationId, appIds)),
      debriefs: await db.select().from(debriefs).where(inArray(debriefs.applicationId, appIds)),
      notes: await db.select().from(notes).where(inArray(notes.applicationId, appIds)),
      companyBrain: await db.select().from(companyFacts).where(eq(companyFacts.orgId, c.org.id)),
    };
    return { name: `${c.org.name} export`, rows: [], json };
  },
};
