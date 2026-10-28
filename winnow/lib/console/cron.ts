/**
 * The daily run (09:00 India time): everything that has to happen when nobody
 * is looking. Each step is independent, so one failing never stops the rest,
 * and each reports what it did.
 */
import { and, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, availabilityLinks, debriefs, documents, interviews, messages, notes, notificationPrefs, notifications, orgs, persons, roles, users } from "@/lib/db/schema";
import { pump } from "./jobs";
import { runFollowups } from "./questions";
import { notifyRole } from "./notify";
import { layout, sendEmail } from "./email";
import { ist } from "./ics";
import { SITE } from "./invites";
import { audit } from "./log";
import { RETENTION_KINDS } from "./privacy";
import { deleteStoredFile } from "./storage";

const DAY = 86_400_000;

/** Interviews tomorrow (India time): the candidate and the interviewer each get a reminder, once. */
export async function interviewReminders() {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3_600_000);
  const tomorrow = istNow.toISOString().slice(0, 10);
  const start = new Date(`${tomorrow}T00:00:00+05:30`);
  start.setTime(start.getTime() + DAY);
  const end = new Date(start.getTime() + DAY);
  const due = await db
    .select({ iv: interviews, name: persons.name, email: persons.email, consent: persons.consent, role: roles.title, roleState: roles.state, orgName: orgs.name, interviewer: users.email })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .innerJoin(roles, eq(roles.id, interviews.roleId))
    .innerJoin(orgs, eq(orgs.id, roles.orgId))
    .leftJoin(users, eq(users.id, interviews.interviewerId))
    .where(and(eq(interviews.status, "scheduled"), gt(interviews.startAt, start), lt(interviews.startAt, end)));
  let sent = 0;
  for (const d of due) {
    if (d.roleState !== "open" || d.consent === "withdrawn") continue;
    const [already] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.applicationId, d.iv.applicationId), eq(messages.subject, `Reminder: ${d.iv.id}`)))
      .limit(1);
    if (already) continue;
    const when = ist(d.iv.startAt);
    if (d.email)
      await sendEmail({
        to: d.email,
        subject: `Tomorrow: your interview for ${d.role}, ${when}`,
        text: `Hi ${d.name.split(" ")[0]},\n\nA reminder that your interview for ${d.role} at ${d.orgName} is tomorrow, ${when} (India time).\n\nIf you can no longer make it, reply to this email.`,
        html: layout([`Hi ${d.name.split(" ")[0]},`, `A reminder that your interview for ${d.role} at ${d.orgName} is tomorrow, ${when} (India time).`, "If you can no longer make it, reply to this email."]),
      });
    if (d.interviewer) await sendEmail({ to: d.interviewer, subject: `Tomorrow: interview with ${d.name}, ${when}`, text: `You are interviewing ${d.name} for ${d.role} tomorrow, ${when}.\n\n${SITE}/console/c/${d.iv.applicationId}` });
    await db.insert(messages).values({ applicationId: d.iv.applicationId, direction: "out", channel: "email", subject: `Reminder: ${d.iv.id}`, body: `Reminder sent for the interview on ${when}.` });
    sent++;
  }
  return sent;
}

/** Links whose every time has passed stop working, and the role is told. */
export async function expireLinks() {
  const open = await db.select().from(availabilityLinks).where(eq(availabilityLinks.status, "sent"));
  let n = 0;
  for (const l of open) {
    if (l.slots.every((s) => new Date(s.start).getTime() < Date.now())) {
      await db.update(availabilityLinks).set({ status: "expired" }).where(eq(availabilityLinks.id, l.id));
      n++;
    }
  }
  return n;
}

/** "Stalled" earns the screen: nothing changed in seven days on a role with candidates. */
export async function stalledRoles() {
  const stale = await db
    .select({ id: roles.id, title: roles.title })
    .from(roles)
    .where(and(eq(roles.state, "open"), lt(roles.lastChangeAt, new Date(Date.now() - 7 * DAY)), sql`exists (select 1 from ${applications} where ${applications.roleId} = ${roles.id})`));
  for (const r of stale) await notifyRole(r.id, "role_stalled", `${r.title} has stalled: nothing has changed in a week`, `/console/roles/${r.id}`, 24 * 7);
  return stale.length;
}

/** One email a day for the types people chose to hear about daily. */
export async function dailyDigest() {
  const prefs = await db.select().from(notificationPrefs).where(and(eq(notificationPrefs.email, true), eq(notificationPrefs.frequency, "daily")));
  const byUser = new Map<string, { orgId: string; types: string[] }[]>();
  for (const p of prefs) {
    const list = byUser.get(p.userId) ?? [];
    const o = list.find((x) => x.orgId === p.orgId);
    if (o) o.types.push(p.type);
    else list.push({ orgId: p.orgId, types: [p.type] });
    byUser.set(p.userId, list);
  }
  let sent = 0;
  for (const [userId, groups] of byUser) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.email) continue;
    for (const g of groups) {
      const items = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.orgId, g.orgId), inArray(notifications.type, g.types), gt(notifications.createdAt, new Date(Date.now() - DAY)), isNull(notifications.readAt)));
      if (!items.length) continue;
      const org = await db.query.orgs.findFirst({ where: eq(orgs.id, g.orgId) });
      await sendEmail({
        to: user.email,
        subject: `Winnow: ${items.length} thing${items.length === 1 ? "" : "s"} from ${org?.name ?? "today"}`,
        text: items.map((i) => `- ${i.title}: ${SITE}${i.href ?? "/console"}`).join("\n"),
        html: layout(items.map((i) => i.title), { label: "Open Winnow", href: `${SITE}/console/notifications` }),
      });
      sent++;
    }
  }
  return sent;
}

/**
 * Retention: each organisation's windows, applied. People who were hired are
 * kept; consent given to the talent pool keeps a person for its own window.
 */
export async function applyRetention() {
  const all = await db.select({ id: orgs.id, retention: orgs.retention }).from(orgs);
  const report: Record<string, number> = {};
  for (const o of all) {
    const days = (k: string) => o.retention[k] ?? RETENTION_KINDS.find((r) => r.key === k)!.def;
    const cutoff = (k: string) => new Date(Date.now() - days(k) * DAY);
    const hired = db.select({ personId: applications.personId }).from(applications).where(and(eq(applications.orgId, o.id), eq(applications.stage, "hired")));

    const msgs = await db
      .delete(messages)
      .where(and(lt(messages.createdAt, cutoff("messages")), inArray(messages.applicationId, db.select({ id: applications.id }).from(applications).where(eq(applications.orgId, o.id)))))
      .returning({ id: messages.id });
    const oldNotes = await db
      .delete(notes)
      .where(and(lt(notes.createdAt, cutoff("notes")), inArray(notes.applicationId, db.select({ id: applications.id }).from(applications).where(eq(applications.orgId, o.id)))))
      .returning({ id: notes.id });
    await db.delete(debriefs).where(and(lt(debriefs.createdAt, cutoff("notes")), inArray(debriefs.applicationId, db.select({ id: applications.id }).from(applications).where(eq(applications.orgId, o.id)))));

    // People past their window: not hired, and either no consent past the application window,
    // consent past the talent pool window, or an explicit keep-until date that has passed.
    const expired = await db
      .select({ id: persons.id })
      .from(persons)
      .where(
        and(
          eq(persons.orgId, o.id),
          notInArray(persons.id, hired),
          or(
            sql`${persons.retainUntil} is not null and ${persons.retainUntil} < current_date`,
            and(
              isNull(persons.retainUntil),
              // Their latest application is older than the window that applies to them.
              sql`not exists (select 1 from ${applications} a where a.person_id = ${persons.id} and a.created_at > case when ${persons.consent} = 'given' then ${cutoff("talent_pool")}::timestamptz else ${cutoff("applications")}::timestamptz end)`,
              lt(persons.createdAt, cutoff("applications")),
            ),
          ),
        ),
      )
      .limit(500);
    for (const p of expired) {
      const files = await db.select({ url: documents.url }).from(documents).where(eq(documents.personId, p.id));
      for (const f of new Set(files.map((x) => x.url).filter(Boolean) as string[])) await deleteStoredFile(f).catch(() => undefined);
      await db.delete(persons).where(eq(persons.id, p.id));
    }
    if (expired.length || msgs.length || oldNotes.length) {
      await audit({ orgId: o.id, action: "privacy.retention_run", entity: "org", entityId: o.id, detail: { people: expired.length, messages: msgs.length, notes: oldNotes.length } });
      report[o.id] = expired.length;
    }
  }
  return report;
}

export async function daily() {
  const steps: [string, () => Promise<unknown>][] = [
    ["jobs", () => pump(20_000)],
    ["followups", runFollowups],
    ["reminders", interviewReminders],
    ["links", expireLinks],
    ["stalled", stalledRoles],
    ["digest", dailyDigest],
    ["retention", applyRetention],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, fn] of steps) {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

