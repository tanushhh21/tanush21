/**
 * The arithmetic, in code rather than in the model, so every score can be
 * explained: points earned out of points available on what is known.
 *
 *   met = full weight, partial = half, not met = nothing.
 *   unknown requirements are unresolved: they cost no score, but lower confidence.
 *   standing (what the list is ordered by) = score, tempered by confidence,
 *   so a candidate who shows little cannot outrank one who shows a lot.
 *
 * Bands: below the bar (a must-have is missing, or the known score is low),
 * verified (every must-have met with checkable evidence, no open contradictions),
 * otherwise needs verification.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, contradictions, evaluations, requirements, rubricVersions, verdicts } from "@/lib/db/schema";

export { BAR, arithmetic, contribution, placesAtStake, type ReqLite, type VerdictLite } from "./arith";
import { arithmetic, contribution } from "./arith";

/** The current rubric's requirements for a role. */
export async function currentRequirements(roleId: string, version: number) {
  return db
    .select({
      id: requirements.id,
      key: requirements.key,
      text: requirements.text,
      weight: requirements.weight,
      mustHave: requirements.mustHave,
      keywords: requirements.keywords,
      minYears: requirements.minYears,
      recencySensitive: requirements.recencySensitive,
      sourceSentence: requirements.sourceSentence,
      origin: requirements.origin,
      position: requirements.position,
    })
    .from(requirements)
    .innerJoin(rubricVersions, eq(rubricVersions.id, requirements.rubricVersionId))
    .where(and(eq(rubricVersions.roleId, roleId), eq(rubricVersions.version, version)))
    .orderBy(asc(requirements.position));
}

/**
 * Recomputes every scored candidate's numbers, band, rank and percentile for
 * the role's current rubric. Cheap: no model calls, only arithmetic.
 */
export async function rankRole(roleId: string, version: number) {
  const reqs = await currentRequirements(roleId, version);
  const evals = await db
    .select({ id: evaluations.id, applicationId: evaluations.applicationId, filteredOut: evaluations.filteredOut, appliedAt: applications.appliedAt })
    .from(evaluations)
    .innerJoin(applications, eq(applications.id, evaluations.applicationId))
    .where(and(eq(evaluations.roleId, roleId), eq(evaluations.rubricVersion, version), eq(evaluations.status, "done")));
  if (evals.length === 0) return;

  const ids = evals.map((e) => e.id);
  const vs = await db.select().from(verdicts).where(inArray(verdicts.evaluationId, ids));
  const open = await db
    .select({ applicationId: contradictions.applicationId, n: sql<number>`count(*)::int` })
    .from(contradictions)
    .where(and(inArray(contradictions.applicationId, evals.map((e) => e.applicationId)), sql`${contradictions.resolvedAt} is null`))
    .groupBy(contradictions.applicationId);
  const openBy = new Map(open.map((o) => [o.applicationId, o.n]));

  const rows = evals.map((e) => {
    const mine = vs.filter((v) => v.evaluationId === e.id);
    return { ...e, a: arithmetic(reqs, mine, openBy.get(e.applicationId) ?? 0), verdicts: mine };
  });
  const ranked = rows
    .filter((r) => !r.filteredOut)
    .sort((x, y) => y.a.standing - x.a.standing || y.a.confidence - x.a.confidence || x.appliedAt.getTime() - y.appliedAt.getTime());
  const n = ranked.length;

  for (const r of rows) {
    const rank = ranked.indexOf(r);
    await db
      .update(evaluations)
      .set({
        score: r.a.score,
        confidence: Math.round(r.a.confidence * 100) / 100,
        band: r.a.band,
        rank: rank >= 0 ? rank + 1 : null,
        percentile: rank >= 0 ? (n === 1 ? 100 : Math.round((100 * (n - 1 - rank)) / (n - 1))) : null,
        mustHavesMet: r.a.mustMet,
        mustHavesTotal: r.a.mustTotal,
        pointsEarned: r.a.pointsEarned,
        pointsAvailable: r.a.pointsAvailable,
      })
      .where(eq(evaluations.id, r.id));
    const reqBy = new Map(reqs.map((q) => [q.key, q]));
    for (const v of r.verdicts) {
      const q = reqBy.get(v.requirementKey);
      const c = q ? contribution(q.weight, v.verdict) : 0;
      if (c !== v.contribution) await db.update(verdicts).set({ contribution: c }).where(eq(verdicts.id, v.id));
    }
  }
}
