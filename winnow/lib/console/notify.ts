/**
 * Notifications: in-app, email, and Slack where connected, per-type preferences.
 * Defaults follow one rule: tell people about things that need them, never
 * about every application (a tool that emails on every application trains
 * people to ignore it).
 */
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationPrefs, notifications, orgs, roles, users } from "@/lib/db/schema";
import { SITE } from "./invites";
import { layout, sendEmail } from "./email";

export const TYPES: { type: string; label: string; inApp: boolean; email: boolean; slack: boolean }[] = [
  { type: "shortlist_ready", label: "A shortlist is ready", inApp: true, email: true, slack: true },
  { type: "candidate_replied", label: "A candidate replied", inApp: true, email: true, slack: false },
  { type: "role_stalled", label: "A role has stalled", inApp: true, email: true, slack: true },
  { type: "contradiction", label: "A contradiction was flagged", inApp: true, email: false, slack: false },
  { type: "scoring_failed", label: "Scoring failed", inApp: true, email: true, slack: true },
  { type: "mention", label: "Someone mentioned you", inApp: true, email: true, slack: false },
  { type: "debrief_due", label: "A debrief is due", inApp: true, email: true, slack: false },
  { type: "interview_booked", label: "A candidate booked an interview", inApp: true, email: false, slack: false },
  { type: "new_application", label: "Every new application", inApp: false, email: false, slack: false },
];

export async function prefsFor(userId: string, orgId: string) {
  const saved = await db.select().from(notificationPrefs).where(and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.orgId, orgId)));
  return TYPES.map((t) => {
    const s = saved.find((x) => x.type === t.type);
    return { ...t, inApp: s?.inApp ?? t.inApp, email: s?.email ?? t.email, slack: s?.slack ?? t.slack, frequency: s?.frequency ?? ("instant" as const) };
  });
}

export async function notify(orgId: string, userIds: string[], type: string, title: string, href: string) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, orgId) });
  const people = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids));
  let slackSent = false;
  for (const p of people) {
    const pref = (await prefsFor(p.id, orgId)).find((t) => t.type === type) ?? { inApp: true, email: false, slack: false, frequency: "instant" as const };
    // A daily digest still records the item; the email goes out once a day (see the daily job).
    if (pref.inApp || (pref.email && pref.frequency === "daily")) await db.insert(notifications).values({ orgId, userId: p.id, type, title, href });
    if (pref.email && pref.frequency === "instant" && p.email) {
      await sendEmail({ to: p.email, subject: title, text: `${title}\n\n${SITE}${href}`, html: layout([title], { label: "Open in Winnow", href: `${SITE}${href}` }) });
    }
    if (pref.slack && org?.slackWebhook && !slackSent) {
      slackSent = true;
      await fetch(org.slackWebhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `${title} <${SITE}${href}|Open>` }) }).catch(() => undefined);
    }
  }
}

/**
 * Notifies the people a role belongs to (its creator and hiring manager),
 * at most once per type and link in a window, so a burst of failures is one
 * notification, not fifty.
 */
export async function notifyRole(roleId: string, type: string, title: string, href: string, windowHours = 6) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return;
  const since = new Date(Date.now() - windowHours * 3_600_000);
  const recent = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.orgId, role.orgId), eq(notifications.type, type), eq(notifications.href, href), gt(notifications.createdAt, since)))
    .limit(1);
  if (recent.length) return;
  await notify(role.orgId, [role.createdBy ?? "", role.hiringManagerId ?? ""], type, title, href);
}
