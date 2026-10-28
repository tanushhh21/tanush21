/**
 * The talent pool: every person who ever applied here, across roles, with
 * what the company already knows about them. Scoped to the roles the viewer
 * can see, so a confidential role never leaks through the pool.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationFacts, applications, debriefs, evaluations, persons, roles, talentPoolMembers, talentPools } from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "@/lib/console/context";

export type TalentRow = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  title: string | null;
  company: string | null;
  years: number | null;
  expectedCtc: number | null;
  notice: number | null;
  tags: string[];
  pools: string[];
  consent: "unknown" | "given" | "withdrawn";
  retainUntil: string | null;
  silver: string | null;
  best: { score: number | null; band: string | null; role: string } | null;
  last: { role: string; roleId: string; applicationId: string; stage: string; decision: string; reason: string | null; at: string };
  applications: number;
  roleIds: string[];
};

const LIMIT = 3000;

export async function loadTalent(c: Ctx): Promise<{ rows: TalentRow[]; pools: { id: string; name: string; n: number }[]; truncated: boolean }> {
  const apps = await db
    .select({
      id: applications.id,
      personId: applications.personId,
      roleId: roles.id,
      role: roles.title,
      roleState: roles.state,
      closeReason: roles.closeReason,
      hiredId: roles.hiredApplicationId,
      rubricVersion: roles.rubricVersion,
      stage: applications.stage,
      decision: applications.decision,
      reason: applications.reasonCode,
      at: applications.createdAt,
    })
    .from(applications)
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(eq(applications.orgId, c.org.id), visibleRoles(c), sql`coalesce(${applications.reasonCode}, '') <> 'duplicate'`))
    .orderBy(desc(applications.createdAt))
    .limit(LIMIT * 3);
  if (apps.length === 0) return { rows: [], pools: [], truncated: false };
  const personIds = [...new Set(apps.map((a) => a.personId))].slice(0, LIMIT);
  const appIds = apps.filter((a) => personIds.includes(a.personId)).map((a) => a.id);

  const [people, evals, facts, members, pools, goodDebriefs] = await Promise.all([
    db.select().from(persons).where(and(inArray(persons.id, personIds), sql`${persons.mergedInto} is null`)),
    db
      .select({ applicationId: evaluations.applicationId, score: evaluations.score, band: evaluations.band, version: evaluations.rubricVersion })
      .from(evaluations)
      .where(and(inArray(evaluations.applicationId, appIds), eq(evaluations.status, "done"))),
    db
      .select({ applicationId: applicationFacts.applicationId, field: applicationFacts.field, value: applicationFacts.value, num: applicationFacts.num })
      .from(applicationFacts)
      .where(and(inArray(applicationFacts.applicationId, appIds), inArray(applicationFacts.field, ["city", "current_title", "current_company", "years_experience", "expected_ctc", "notice_period_days"]))),
    db
      .select({ personId: talentPoolMembers.personId, pool: talentPools.name })
      .from(talentPoolMembers)
      .innerJoin(talentPools, eq(talentPools.id, talentPoolMembers.poolId))
      .where(inArray(talentPoolMembers.personId, personIds)),
    db
      .select({ id: talentPools.id, name: talentPools.name, n: sql<number>`count(${talentPoolMembers.personId})::int` })
      .from(talentPools)
      .leftJoin(talentPoolMembers, eq(talentPoolMembers.poolId, talentPools.id))
      .where(eq(talentPools.orgId, c.org.id))
      .groupBy(talentPools.id)
      .orderBy(talentPools.name),
    db
      .select({ applicationId: debriefs.applicationId })
      .from(debriefs)
      .where(and(inArray(debriefs.applicationId, appIds), inArray(debriefs.wouldHire, ["yes", "strong_yes"]))),
  ]);
  const liked = new Set(goodDebriefs.map((d) => d.applicationId));
  const byPerson = new Map<string, typeof apps>();
  for (const a of apps) if (personIds.includes(a.personId)) byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a]);

  const rows: TalentRow[] = people.map((p) => {
    const list = byPerson.get(p.id) ?? [];
    const last = list[0];
    const current = list.map((a) => ({ a, e: evals.find((e) => e.applicationId === a.id && e.version === a.rubricVersion) })).filter((x) => x.e);
    const best = current.sort((x, y) => (y.e!.score ?? 0) - (x.e!.score ?? 0))[0];
    const fact = (field: string) => {
      for (const a of list) {
        const f = facts.find((x) => x.applicationId === a.id && x.field === field);
        if (f) return f;
      }
      return null;
    };
    // Silver medallists: strong, and let go only because someone else was taken.
    const silverApp = list.find(
      (a) =>
        a.reason === "someone_else" ||
        (a.roleState === "closed" && a.closeReason === "filled" && a.hiredId !== a.id && ["shortlisted", "interviewing", "offer"].includes(a.stage)) ||
        (liked.has(a.id) && a.stage !== "hired" && a.roleState === "closed"),
    );
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      city: fact("city")?.value ?? p.city,
      title: fact("current_title")?.value ?? null,
      company: fact("current_company")?.value ?? null,
      years: fact("years_experience")?.num ?? null,
      expectedCtc: fact("expected_ctc")?.num ?? null,
      notice: fact("notice_period_days")?.num ?? null,
      tags: p.tags,
      pools: members.filter((m) => m.personId === p.id).map((m) => m.pool),
      consent: p.consent,
      retainUntil: p.retainUntil,
      silver: silverApp ? silverApp.role : null,
      best: best ? { score: best.e!.score, band: best.e!.band, role: best.a.role } : null,
      last: { role: last.role, roleId: last.roleId, applicationId: last.id, stage: last.stage, decision: last.decision, reason: last.reason, at: last.at.toISOString() },
      applications: list.length,
      roleIds: list.map((a) => a.roleId),
    };
  });
  rows.sort((a, b) => (b.last.at > a.last.at ? 1 : -1));
  return { rows, pools, truncated: new Set(apps.map((a) => a.personId)).size > LIMIT };
}
