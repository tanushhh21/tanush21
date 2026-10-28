/**
 * The company brain: what Winnow believes about a company, each belief with
 * its provenance and confidence. It is given to the AI as context.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyFacts, roles, type FactGroup } from "@/lib/db/schema";

export const GROUPS: { key: FactGroup; label: string }[] = [
  { key: "what_you_build", label: "What you build" },
  { key: "stage_scale", label: "Stage and scale" },
  { key: "stack", label: "Stack" },
  { key: "team", label: "Team composition" },
  { key: "operating_reality", label: "Operating reality" },
  { key: "compensation", label: "Compensation reality" },
  { key: "locations", label: "Locations and attendance" },
  { key: "past_hires", label: "What has gone wrong in past hires" },
  { key: "vocabulary", label: "Your level ladder and vocabulary" },
];

export async function companyContext(orgId: string) {
  const facts = await db
    .select({ group: companyFacts.group, text: companyFacts.text, provenance: companyFacts.provenance })
    .from(companyFacts)
    .where(and(eq(companyFacts.orgId, orgId), eq(companyFacts.active, true)));
  if (facts.length === 0) return "";
  return GROUPS.filter((g) => facts.some((f) => f.group === g.key))
    .map((g) => `${g.label}:\n${facts.filter((f) => f.group === g.key).map((f) => `- ${f.text}${f.provenance === "inferred" ? " (inferred)" : ""}`).join("\n")}`)
    .join("\n\n");
}

// ---- Beliefs Winnow infers from the company's own decisions ----------------------

type Belief = { key: string; group: FactGroup; text: string; evidence: string; confidence: number };

const lakh = (n: number) => `₹${Math.round(n / 10000) / 10}L`;
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
/** Words too general to say anything about a stack. */
const GENERIC = sql`array['another','building','build','familiarity','experience','strong','ability','knowledge','working','skills','good','team','systems','services','backend','frontend','engineering','product','years','least','design']::text[]`;
const conf = (n: number, full: number) => Math.round(Math.min(0.95, 0.3 + (0.65 * n) / full) * 100) / 100;

/**
 * Recomputes what the data says about the company and stores each belief as
 * inferred, with its evidence. A belief someone has edited or rejected is
 * theirs from then on and is never overwritten.
 */
export async function inferBeliefs(orgId: string) {
  const out: Belief[] = [];
  const decided = await db.execute(sql`
    select a.reason_code as code, a.decision, f.field, f.num
    from application a
    left join application_fact f on f.application_id = a.id and f.field in ('expected_ctc', 'notice_period_days')
    where a.org_id = ${orgId} and a.decision in ('dropped', 'shortlisted')`);
  const rows = (decided.rows ?? decided) as { code: string | null; decision: string; field: string | null; num: number | null }[];
  const ctcDropped = rows.filter((r) => r.code === "comp_misaligned" && r.field === "expected_ctc" && r.num).map((r) => Number(r.num));
  const ctcShort = rows.filter((r) => r.decision === "shortlisted" && r.field === "expected_ctc" && r.num).map((r) => Number(r.num));
  if (ctcDropped.length >= 3) {
    const floor = Math.min(...ctcDropped);
    out.push({
      key: "comp_ceiling",
      group: "compensation",
      text: `Candidates expecting more than about ${lakh(floor)} a year are usually turned down on compensation.`,
      evidence: `${ctcDropped.length} rejections for compensation, median expectation ${lakh(med(ctcDropped))}${ctcShort.length ? `, against ${lakh(med(ctcShort))} among those shortlisted` : ""}.`,
      confidence: conf(ctcDropped.length, 15),
    });
  }
  const notice = rows.filter((r) => r.code === "notice_too_long" && r.field === "notice_period_days" && r.num != null).map((r) => Number(r.num));
  if (notice.length >= 3)
    out.push({
      key: "notice_limit",
      group: "operating_reality",
      text: `Notice periods of ${Math.min(...notice)} days or more tend to be turned down.`,
      evidence: `${notice.length} rejections for notice period, median ${Math.round(med(notice))} days.`,
      confidence: conf(notice.length, 12),
    });

  const roleRows = await db.select({ locations: roles.locations, family: roles.family, id: roles.id, version: roles.rubricVersion }).from(roles).where(eq(roles.orgId, orgId));
  const locs = new Map<string, number>();
  for (const r of roleRows) for (const l of new Set(r.locations.map((x) => x.trim()).filter(Boolean))) locs.set(l, (locs.get(l) ?? 0) + 1);
  const topLoc = [...locs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topLoc && roleRows.length >= 2 && topLoc[1] / roleRows.length >= 0.5)
    out.push({ key: "locations_main", group: "locations", text: `Most hiring is for ${topLoc[0]}.`, evidence: `${topLoc[1]} of ${roleRows.length} roles list ${topLoc[0]}.`, confidence: conf(topLoc[1], 8) });

  const fam = new Map<string, number>();
  for (const r of roleRows) if (r.family) fam.set(r.family, (fam.get(r.family) ?? 0) + 1);
  const topFam = [...fam.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topFam && topFam[1] >= 2) out.push({ key: "team_family", group: "team", text: `Most open roles are in ${topFam[0]}.`, evidence: `${topFam[1]} of ${roleRows.length} roles.`, confidence: conf(topFam[1], 8) });

  const words = await db.execute(sql`
    select lower(k) as k, count(distinct v.role_id)::int as n
    from requirement q
    join rubric_version v on v.id = q.rubric_version_id
    join role r on r.id = v.role_id and r.rubric_version = v.version
    cross join lateral unnest(q.keywords) k
    where r.org_id = ${orgId} and length(k) > 1 and lower(k) <> all(${GENERIC})
    group by lower(k) having count(distinct v.role_id) >= 2
    order by n desc limit 5`);
  const kw = (words.rows ?? words) as { k: string; n: number }[];
  if (kw.length >= 2)
    out.push({
      key: "stack_common",
      group: "stack",
      text: `${kw.slice(0, -1).map((k) => k.k).join(", ")} and ${kw[kw.length - 1].k} come up across your roles.`,
      evidence: kw.map((k) => `${k.k} in ${k.n} rubrics`).join("; ") + ".",
      confidence: conf(Math.min(...kw.map((k) => k.n)), 6),
    });

  const late = await db.execute(sql`
    select detail->>'reasonCode' as code, count(*)::int as n
    from audit_log
    where org_id = ${orgId} and action = 'decision.dropped' and detail->>'stage' in ('interviewing', 'offer')
    group by 1 order by n desc`);
  const lateRows = (late.rows ?? late) as { code: string; n: number }[];
  const lateTotal = lateRows.reduce((n, r) => n + r.n, 0);
  if (lateTotal >= 3 && lateRows[0])
    out.push({
      key: "past_hires_late",
      group: "past_hires",
      text: `After interviews, the most common reason to say no is "${lateRows[0].code.replace(/_/g, " ")}".`,
      evidence: `${lateRows[0].n} of ${lateTotal} rejections after an interview.`,
      confidence: conf(lateTotal, 12),
    });

  for (const b of out)
    await db
      .insert(companyFacts)
      .values({ orgId, key: b.key, group: b.group, text: b.text, evidence: b.evidence, confidence: b.confidence, provenance: "inferred" })
      .onConflictDoUpdate({
        target: [companyFacts.orgId, companyFacts.key],
        set: { text: b.text, evidence: b.evidence, confidence: b.confidence, updatedAt: new Date() },
        setWhere: sql`${companyFacts.updatedBy} is null`,
      });
  return out.length;
}
