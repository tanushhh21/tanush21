import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, chatMessages, memberships, roles } from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "@/lib/console/context";

const HOUR = 3_600_000;

/**
 * Where "while you were away" starts. A gap of more than an hour since the
 * last visit starts a new away window; within a visit it stays put, so the
 * feed does not empty itself on every refresh.
 */
export async function awayWindow(c: Ctx): Promise<Date> {
  const now = new Date();
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, c.org.id), eq(memberships.userId, c.user.id)) });
  if (!m) return new Date(now.getTime() - 24 * HOUR);
  const gone = !m.seenAt || now.getTime() - m.seenAt.getTime() > HOUR;
  const from = gone ? (m.seenAt ?? new Date(now.getTime() - 7 * 24 * HOUR)) : (m.awayFrom ?? m.seenAt ?? now);
  await db.update(memberships).set({ seenAt: now, awayFrom: from }).where(eq(memberships.id, m.id));
  return from;
}

/** Winnow's unattended work and other people's actions since then, newest first. */
export async function awayFeed(c: Ctx, since: Date) {
  const visible = db.select({ id: roles.id }).from(roles).where(visibleRoles(c));
  const rows = await db
    .select({ id: activity.id, kind: activity.kind, message: activity.message, at: activity.createdAt, roleId: activity.roleId, roleTitle: roles.title, actorId: activity.actorId })
    .from(activity)
    .innerJoin(roles, eq(roles.id, activity.roleId))
    .where(and(eq(activity.orgId, c.org.id), inArray(activity.roleId, visible), gt(activity.createdAt, since), sql`(${activity.actorId} is null or ${activity.actorId} <> ${c.user.id})`))
    .orderBy(desc(activity.createdAt))
    .limit(400);
  // Collapse runs of routine work ("Scored 34 new applications") so the feed reads like a summary.
  const ROUTINE: Record<string, [string, string]> = { scored: ["Scored", "application"], parsed: ["Read", "CV"], rescored_after_answer: ["Re-scored", "candidate"] };
  const out: { id: string; text: string; at: Date; roleId: string | null; roleTitle: string; failure: boolean }[] = [];
  const groups = new Map<string, number>();
  for (const r of rows) {
    const routine = ROUTINE[r.kind];
    if (routine) {
      const k = `${r.kind}:${r.roleId}`;
      const at = groups.get(k);
      if (at != null) {
        const n = Number(out[at].id.split(":")[2]) + 1;
        out[at] = { ...out[at], id: `${k}:${n}`, text: `${routine[0]} ${n} new ${routine[1]}${n === 1 ? "" : "s"}` };
        continue;
      }
      groups.set(k, out.length);
      out.push({ id: `${k}:1`, text: `${routine[0]} 1 new ${routine[1]}`, at: r.at, roleId: r.roleId, roleTitle: r.roleTitle, failure: false });
      continue;
    }
    out.push({ id: r.id, text: r.message, at: r.at, roleId: r.roleId, roleTitle: r.roleTitle, failure: r.kind.endsWith("_failed") || r.kind === "parse_failure" });
  }
  return out.slice(0, 40);
}
