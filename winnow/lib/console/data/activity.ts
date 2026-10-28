import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, chatMessages, jobs, users } from "@/lib/db/schema";

/** How activity kinds roll up into the stages a TA recognises. */
export const STAGE_OF: Record<string, string> = {
  parsed: "Reading CVs",
  parse_failure: "Reading CVs",
  scored: "Scoring",
  rescored_after_answer: "Scoring",
  score_failed: "Scoring",
  rescore_failed: "Scoring",
  rubric_built: "Rubric",
  rubric_failed: "Rubric",
  rubric_changed: "Rubric",
  sourcing_planned: "Sourcing",
  sourcing_requested: "Sourcing",
  sourcing_failed: "Sourcing",
  explained: "Explanations",
  challenged: "Explanations",
  questions_sent: "Verification",
  reply_received: "Verification",
  questions_unanswered: "Verification",
  verify_skipped: "Verification",
};

export const isFailure = (kind: string) => kind.endsWith("_failed") || kind === "parse_failure" || kind === "questions_unanswered";

export type Filter = "all" | "winnow" | "people" | "failures";

export async function loadActivity(roleId: string, f: Filter, before?: Date, limit = 200) {
  const where = and(
    eq(activity.roleId, roleId),
    before ? lt(activity.createdAt, before) : undefined,
    f === "winnow" ? sql`${activity.actorId} is null` : f === "people" ? sql`${activity.actorId} is not null` : undefined,
    f === "failures" ? sql`(${activity.kind} like '%\\_failed' or ${activity.kind} in ('parse_failure','questions_unanswered'))` : undefined,
  );
  return db
    .select({ id: activity.id, kind: activity.kind, message: activity.message, costUsd: activity.costUsd, at: activity.createdAt, actor: users.name, actorEmail: users.email, detail: activity.detail })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(where)
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

export async function costByStage(roleId: string) {
  const rows = await db
    .select({ kind: activity.kind, cost: sql<number>`coalesce(sum(${activity.costUsd}),0)::float`, n: sql<number>`count(*)::int` })
    .from(activity)
    .where(eq(activity.roleId, roleId))
    .groupBy(activity.kind);
  const [chat] = await db
    .select({ cost: sql<number>`coalesce(sum(${chatMessages.costUsd}),0)::float`, n: sql<number>`count(*) filter (where ${chatMessages.author} = 'winnow')::int` })
    .from(chatMessages)
    .where(eq(chatMessages.roleId, roleId));
  const stages = new Map<string, { cost: number; n: number }>();
  for (const r of rows) {
    const s = STAGE_OF[r.kind];
    if (!s || !r.cost) continue;
    const cur = stages.get(s) ?? { cost: 0, n: 0 };
    stages.set(s, { cost: cur.cost + r.cost, n: cur.n + r.n });
  }
  if (chat?.cost) stages.set("Role chat", { cost: chat.cost, n: chat.n });
  const [failedJobs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.roleId, roleId), eq(jobs.status, "failed")));
  const list = [...stages.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.cost - a.cost);
  return { stages: list, total: list.reduce((n, s) => n + s.cost, 0), failedJobs: failedJobs?.n ?? 0, failures: rows.filter((r) => isFailure(r.kind)).reduce((n, r) => n + r.n, 0) };
}
