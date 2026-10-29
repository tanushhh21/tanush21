/**
 * Role summaries: counts, stage distribution, and a status computed from what
 * is actually happening (never set by hand). "Stalled" means nothing changed
 * in seven days, and it outranks everything but closed.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, contradictions, evaluations, observations, questions, refusedCriteria, roles, rubricVersions, users, type Stage } from "@/lib/db/schema";
import { audit, logActivity } from "./log";
import { visibleRoles, type Ctx } from "./context";

export type RoleStatus =
  | "sourcing"
  | "screening"
  | "waiting on you"
  | "waiting on the manager"
  | "interviewing"
  | "offer out"
  | "stalled"
  | "closed";

export type RoleSummary = {
  id: string;
  title: string;
  hiringManager: string | null;
  hiringManagerId: string | null;
  createdBy: string | null;
  state: string;
  daysOpen: number;
  targetDate: string | null;
  received: number;
  scored: number;
  failed: number;
  unreadable: number;
  shortlisted: number;
  stages: Partial<Record<Stage, number>>;
  status: RoleStatus;
  risk: "high" | "medium" | "low";
  daysSinceChange: number;
};

const STALL_DAYS = 7;
const DAY = 86_400_000;

export function statusTone(s: RoleStatus): "alert" | "caution" | "signal" | "muted" {
  if (s === "stalled") return "alert";
  if (s === "waiting on you") return "signal";
  if (s === "waiting on the manager") return "caution";
  if (s === "closed") return "muted";
  return "muted";
}

export async function summarizeRoles(c: Ctx, opts: { includeClosed?: boolean; mine?: boolean } = {}): Promise<RoleSummary[]> {
  const conds = [visibleRoles(c)];
  if (!opts.includeClosed) conds.push(sql`${roles.state} <> 'closed'`);
  if (opts.mine) conds.push(sql`(${roles.hiringManagerId} = ${c.user.id} or ${roles.createdBy} = ${c.user.id})`);

  const rows = await db
    .select({
      role: roles,
      manager: users.name,
      received: sql<number>`count(distinct ${applications.id})::int`,
      scored: sql<number>`count(distinct ${applications.id}) filter (where ${evaluations.status} = 'done')::int`,
      failed: sql<number>`count(distinct ${applications.id}) filter (where ${evaluations.status} = 'failed')::int`,
      unreadable: sql<number>`count(distinct ${applications.id}) filter (where ${applications.parseStatus} = 'unreadable')::int`,
      shortlisted: sql<number>`count(distinct ${applications.id}) filter (where ${applications.decision} = 'shortlisted')::int`,
      unseenShortlist: sql<number>`count(distinct ${applications.id}) filter (where ${applications.decision} = 'shortlisted' and ${applications.managerSeenAt} is null)::int`,
      unreadReplies: sql<number>`count(distinct ${applications.id}) filter (where ${applications.lastReplyAt} is not null and (${applications.replyReadAt} is null or ${applications.replyReadAt} < ${applications.lastReplyAt}))::int`,
    })
    .from(roles)
    .leftJoin(users, eq(users.id, roles.hiringManagerId))
    .leftJoin(applications, eq(applications.roleId, roles.id))
    .leftJoin(evaluations, and(eq(evaluations.applicationId, applications.id), eq(evaluations.rubricVersion, roles.rubricVersion)))
    .where(and(...conds))
    .groupBy(roles.id, users.name)
    .orderBy(desc(roles.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.role.id);

  const stageRows = await db
    .select({ roleId: applications.roleId, stage: applications.stage, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(sql`${applications.roleId} in ${ids}`)
    .groupBy(applications.roleId, applications.stage);
  const drafted = await db
    .select({ roleId: questions.roleId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(sql`${questions.roleId} in ${ids}`, eq(questions.status, "drafted")))
    .groupBy(questions.roleId);
  const unreadFlags = await db
    .select({ roleId: applications.roleId, n: sql<number>`count(*)::int` })
    .from(contradictions)
    .innerJoin(applications, eq(applications.id, contradictions.applicationId))
    .where(and(sql`${applications.roleId} in ${ids}`, sql`${contradictions.readAt} is null`))
    .groupBy(applications.roleId);

  const byRole = <T extends { roleId: string; n: number }>(list: T[]) => new Map(list.map((x) => [x.roleId, x.n]));
  const draftedBy = byRole(drafted);
  const flagsBy = byRole(unreadFlags);

  return rows.map((r) => {
    const role = r.role;
    const stages: Partial<Record<Stage, number>> = {};
    for (const s of stageRows) if (s.roleId === role.id) stages[s.stage] = s.n;
    const daysSinceChange = Math.floor((Date.now() - role.lastChangeAt.getTime()) / DAY);
    const youPending = (draftedBy.get(role.id) ?? 0) + r.unreadReplies + (flagsBy.get(role.id) ?? 0) + (r.scored > 0 && !role.rubricReviewedAt ? 1 : 0);

    let status: RoleStatus;
    if (role.state === "closed") status = "closed";
    else if (daysSinceChange >= STALL_DAYS && r.received > 0) status = "stalled";
    else if ((stages.offer ?? 0) > 0) status = "offer out";
    else if ((stages.interviewing ?? 0) > 0) status = "interviewing";
    else if (r.unseenShortlist > 0) status = "waiting on the manager";
    else if (youPending > 0) status = "waiting on you";
    else if (r.received > 0) status = "screening";
    else status = "sourcing";

    let risk: RoleSummary["risk"] = "low";
    if (role.targetDate && role.state !== "closed") {
      const left = (new Date(role.targetDate).getTime() - Date.now()) / DAY;
      const late = (stages.interviewing ?? 0) + (stages.offer ?? 0) === 0;
      if (left < 0 || (left < 14 && late)) risk = "high";
      else if (left < 30 && r.shortlisted === 0) risk = "medium";
    }
    if (status === "stalled" && risk === "low") risk = "medium";

    return {
      id: role.id,
      title: role.title,
      hiringManager: r.manager,
      hiringManagerId: role.hiringManagerId,
      createdBy: role.createdBy,
      state: role.state,
      daysOpen: Math.floor((Date.now() - role.createdAt.getTime()) / DAY),
      targetDate: role.targetDate,
      received: r.received,
      scored: r.scored,
      failed: r.failed,
      unreadable: r.unreadable,
      shortlisted: r.shortlisted,
      stages,
      status,
      risk,
      daysSinceChange,
    };
  });
}

/** Marks a role as having changed, which is what keeps it out of "stalled". */
export async function touchRole(roleId: string) {
  await db.update(roles).set({ lastChangeAt: new Date() }).where(eq(roles.id, roleId));
}

/** What a role is screened on, in one line (the Criteria tab). */
export async function rubricStrip(roleId: string, version: number) {
  const { currentRequirements } = await import("./scoring");
  const reqs = await currentRequirements(roleId, version);
  const [refused] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(refusedCriteria)
    .innerJoin(rubricVersions, eq(rubricVersions.id, refusedCriteria.rubricVersionId))
    .where(and(eq(rubricVersions.roleId, roleId), eq(rubricVersions.version, version), eq(refusedCriteria.addedAnyway, false)));
  return { reqs: reqs.length, must: reqs.filter((r) => r.mustHave).length, refused: refused?.n ?? 0 };
}

/**
 * Closes (or holds) a role and records who was hired: the most useful fact
 * Winnow can learn, as it checks the criteria against what really happened.
 * Shared by role settings and chat.
 */
export async function closeRoleWith(c: Ctx, role: typeof roles.$inferSelect, reason: "filled" | "cancelled" | "on_hold", hiredIds: string[], note: string) {
  const valid = hiredIds.length ? await db.select({ id: applications.id, personId: applications.personId }).from(applications).where(eq(applications.roleId, role.id)) : [];
  const picks = valid.filter((v) => hiredIds.includes(v.id));
  await db
    .update(roles)
    .set({ state: reason === "on_hold" ? "on_hold" : "closed", closeReason: reason, hiredApplicationId: picks[0]?.id ?? null, lastChangeAt: new Date(), closedAt: reason === "on_hold" ? null : new Date() })
    .where(eq(roles.id, role.id));
  for (const p of picks) {
    await db
      .update(applications)
      .set({ stage: "hired", stageChangedAt: new Date(), acceptedAt: sql`coalesce(${applications.acceptedAt}, now())` })
      .where(eq(applications.id, p.id));
    await db.insert(observations).values({ orgId: c.org.id, kind: "outcome", personId: p.personId, applicationId: p.id, roleId: role.id, payload: { hired: true, via: "close" }, createdBy: c.user.id });
  }
  await audit({ orgId: c.org.id, actorId: c.user.id, action: reason === "on_hold" ? "role.hold" : "role.close", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: role.rubricVersion, detail: { reason, hired: picks.map((p) => p.id), note: note.slice(0, 1000) } });
  await logActivity({
    orgId: c.org.id,
    roleId: role.id,
    kind: reason === "on_hold" ? "role_on_hold" : "role_closed",
    message: reason === "on_hold" ? "Put the role on hold" : reason === "filled" ? `Closed the role: filled${picks.length ? ` (${picks.length} hired)` : ""}` : "Closed the role: cancelled",
    actorId: c.user.id,
  });
  return picks.length;
}
