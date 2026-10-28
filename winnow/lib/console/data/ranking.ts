/**
 * Everything the Ranking and Candidates screens show, one row per application:
 * the evaluation against the current rubric, every verdict, every fact read
 * off the application, and the decision.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationFacts,
  applications,
  contradictions,
  documents,
  evaluations,
  persons,
  reasonCodes,
  savedViews,
  users,
  verdicts,
  type Band,
  type VerdictValue,
} from "@/lib/db/schema";
import type { Ctx } from "@/lib/console/context";
import { currentRequirements } from "@/lib/console/scoring";

export type FactCell = { v: string; n: number | null; s: boolean };

export type Row = {
  id: string;
  personId: string;
  name: string;
  status: "reading" | "unreadable" | "waiting" | "scoring" | "failed" | "done";
  problem: string | null;
  rank: number | null;
  score: number | null;
  confidence: number | null;
  band: Band | null;
  percentile: number | null;
  strength: string | null;
  gap: string | null;
  mustMet: number | null;
  mustTotal: number | null;
  evidence: "strong" | "moderate" | "weak" | null;
  filteredOut: boolean;
  source: string;
  referredBy: string | null;
  appliedAt: string;
  stage: string;
  stageDays: number;
  decision: string;
  reasonCode: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  contradictions: number;
  managerSeen: boolean;
  suggestions: { requirementKey: string | null; text: string }[];
  verdicts: Record<string, VerdictValue>;
  facts: Record<string, FactCell>;
  filename: string | null;
};

const DAY = 86_400_000;

export async function loadRanking(roleId: string, version: number) {
  const reqs = await currentRequirements(roleId, version);
  const apps = await db
    .select({
      app: applications,
      name: persons.name,
      decidedBy: users.name,
      ev: evaluations,
    })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .leftJoin(users, eq(users.id, applications.decidedBy))
    .leftJoin(evaluations, and(eq(evaluations.applicationId, applications.id), eq(evaluations.rubricVersion, version)))
    .where(eq(applications.roleId, roleId))
    .orderBy(asc(evaluations.rank), asc(applications.appliedAt));

  const ids = apps.map((a) => a.app.id);
  const evIds = apps.map((a) => a.ev?.id).filter(Boolean) as string[];
  const [vs, facts, flags, docs] = await Promise.all([
    evIds.length ? db.select({ e: verdicts.evaluationId, k: verdicts.requirementKey, v: verdicts.verdict }).from(verdicts).where(inArray(verdicts.evaluationId, evIds)) : [],
    ids.length
      ? db
          .select({ a: applicationFacts.applicationId, f: applicationFacts.field, v: applicationFacts.value, n: applicationFacts.num, s: applicationFacts.stated })
          .from(applicationFacts)
          .where(inArray(applicationFacts.applicationId, ids))
      : [],
    ids.length
      ? db
          .select({ a: contradictions.applicationId, n: sql<number>`count(*)::int` })
          .from(contradictions)
          .where(and(inArray(contradictions.applicationId, ids), isNull(contradictions.resolvedAt)))
          .groupBy(contradictions.applicationId)
      : [],
    ids.length ? db.select({ a: documents.applicationId, f: documents.filename }).from(documents).where(and(inArray(documents.applicationId, ids), eq(documents.kind, "cv"))) : [],
  ]);

  const rows: Row[] = apps.map(({ app, name, decidedBy, ev }) => {
    const verdictMap: Record<string, VerdictValue> = {};
    if (ev) for (const v of vs) if (v.e === ev.id) verdictMap[v.k] = v.v;
    const factMap: Record<string, FactCell> = {};
    for (const f of facts) if (f.a === app.id) factMap[f.f] = { v: f.v, n: f.n, s: f.s };
    let status: Row["status"];
    if (app.parseStatus === "unreadable") status = "unreadable";
    else if (app.parseStatus === "pending") status = "reading";
    else if (!ev) status = "waiting";
    else status = ev.status === "done" ? "done" : ev.status === "failed" ? "failed" : "scoring";
    return {
      id: app.id,
      personId: app.personId,
      name,
      status,
      problem: app.parseError ?? ev?.error ?? null,
      rank: ev?.rank ?? null,
      score: ev?.status === "done" ? ev.score : null,
      confidence: ev?.status === "done" ? ev.confidence : null,
      band: ev?.status === "done" ? ev.band : null,
      percentile: ev?.percentile ?? null,
      strength: ev?.reasonStrength ?? null,
      gap: ev?.reasonGap ?? null,
      mustMet: ev?.mustHavesMet ?? null,
      mustTotal: ev?.mustHavesTotal ?? null,
      evidence: ev?.evidenceStrength ?? null,
      filteredOut: ev?.filteredOut ?? false,
      source: app.source,
      referredBy: app.referredBy,
      appliedAt: app.appliedAt.toISOString(),
      stage: app.stage,
      stageDays: Math.floor((Date.now() - app.stageChangedAt.getTime()) / DAY),
      decision: app.decision,
      reasonCode: app.reasonCode,
      decidedBy,
      decidedAt: app.decidedAt?.toISOString() ?? null,
      contradictions: flags.find((f) => f.a === app.id)?.n ?? 0,
      managerSeen: Boolean(app.managerSeenAt),
      suggestions: ev?.suggestions ?? [],
      verdicts: verdictMap,
      facts: factMap,
      filename: docs.find((d) => d.a === app.id)?.f ?? null,
    };
  });

  return {
    requirements: reqs.map((q) => ({ key: q.key, text: q.text, weight: q.weight, mustHave: q.mustHave })),
    rows,
  };
}

export async function reasonsFor(orgId: string) {
  return db
    .select({ code: reasonCodes.code, label: reasonCodes.label, applies: reasonCodes.applies })
    .from(reasonCodes)
    .where(and(eq(reasonCodes.active, true), or(isNull(reasonCodes.orgId), eq(reasonCodes.orgId, orgId))))
    .orderBy(asc(reasonCodes.label));
}

export async function viewsFor(c: Ctx, roleId: string, scope: "ranking" | "candidates") {
  return db
    .select({ id: savedViews.id, name: savedViews.name, config: savedViews.config, mine: sql<boolean>`${savedViews.userId} = ${c.user.id}` })
    .from(savedViews)
    .where(and(eq(savedViews.roleId, roleId), eq(savedViews.scope, scope)))
    .orderBy(asc(savedViews.name));
}

export type Ranking = Awaited<ReturnType<typeof loadRanking>>;
export type Reason = Awaited<ReturnType<typeof reasonsFor>>[number];
