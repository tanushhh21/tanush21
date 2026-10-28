/**
 * Notifications: in-app, email, and Slack where connected, per-type preferences.
 * Defaults follow one rule: tell people about things that need them, never
 * about every application (a tool that emails on every application trains
 * people to ignore it).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationPrefs, notifications, orgs, users } from "@/lib/db/schema";
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
  { type: "new_application", label: "Every new application", inApp: false, email: false, slack: false },
];

export async function prefsFor(userId: string, orgId: string) {
  const saved = await db.select().from(notificationPrefs).where(and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.orgId, orgId)));
  return TYPES.map((t) => {
    const s = saved.find((x) => x.type === t.type);
    return { ...t, inApp: s?.inApp ?? t.inApp, email: s?.email ?? t.email, slack: s?.slack ?? t.slack };
  });
}

export async function notify(orgId: string, userIds: string[], type: string, title: string, href: string) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, orgId) });
  const people = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids));
  let slackSent = false;
  for (const p of people) {
    const pref = (await prefsFor(p.id, orgId)).find((t) => t.type === type) ?? { inApp: true, email: false, slack: false };
    if (pref.inApp) await db.insert(notifications).values({ orgId, userId: p.id, type, title, href });
    if (pref.email && p.email) {
      await sendEmail({ to: p.email, subject: title, text: `${title}\n\n${SITE}${href}`, html: layout([title], { label: "Open in Winnow", href: `${SITE}${href}` }) });
    }
    if (pref.slack && org?.slackWebhook && !slackSent) {
      slackSent = true;
      await fetch(org.slackWebhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `${title} <${SITE}${href}|Open>` }) }).catch(() => undefined);
    }
  }
}
