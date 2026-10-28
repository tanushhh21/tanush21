/**
 * Questions to candidates. Each send is one email per candidate with a private
 * reply link (getwinnow.in/r/<token>); answers come back through that page,
 * become part of the record, and the candidate is re-scored with them.
 * Follow-up discipline: two follow-ups, spaced, then stop and record it.
 */
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, messages, orgs, persons, questions, roles } from "@/lib/db/schema";
import { EMAIL_FROM, layout, sendEmail } from "./email";
import { SITE, token } from "./invites";
import { logActivity, audit } from "./log";
import { touchRole } from "./roles";

export const FOLLOWUP_DAYS = [3, 6];

async function sender(roleId: string) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  const org = role && (await db.query.orgs.findFirst({ where: eq(orgs.id, role.orgId) }));
  if (!role || !org) throw new Error("Role not found.");
  if (role.state !== "open") throw new Error(role.state === "closed" ? "This role is closed, so nothing more is sent." : "This role is on hold, so nothing is sent until it reopens.");
  const mode = role.questionSender ?? org.questionSender;
  // We can only send from our own verified domain; "from the company" means
  // the company's name, with replies going to its careers address.
  const from = mode === "company" ? `${org.name} via Winnow <${EMAIL_FROM.match(/<(.+)>/)?.[1] ?? "hello@getwinnow.in"}>` : EMAIL_FROM;
  const replyTo = mode === "company" && org.careersEmail ? org.careersEmail : undefined;
  return { role, org, from, replyTo, mode };
}

/** Sends every drafted question for one application, as one email. */
export async function sendFor(applicationId: string, actorId: string | null) {
  const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!app) throw new Error("Application not found.");
  const person = await db.query.persons.findFirst({ where: eq(persons.id, app.personId) });
  if (!person?.email) throw new Error(`No email address for ${person?.name ?? "this candidate"}.`);
  if (person.consent === "withdrawn") throw new Error(`${person.name} withdrew consent, so Winnow will not contact them.`);
  const qs = await db.select().from(questions).where(and(eq(questions.applicationId, app.id), eq(questions.status, "drafted")));
  if (qs.length === 0) return 0;
  const s = await sender(app.roleId);
  const t = token(18);
  const batchId = crypto.randomUUID();
  const url = `${SITE}/r/${t}`;
  const first = person.name.split(" ")[0];
  const lines = qs.map((q, i) => `${i + 1}. ${q.text}`);
  const res = await sendEmail({
    to: person.email,
    from: s.from,
    replyTo: s.replyTo,
    subject: `A few questions about your application for ${s.role.title}`,
    text: `Hi ${first},\n\nThank you for applying for ${s.role.title} at ${s.org.name}. Before we go further, we would like to understand a little more:\n\n${lines.join("\n")}\n\nYou can answer here: ${url}\n\nThank you,\n${s.org.name}`,
    html: layout([`Hi ${first},`, `Thank you for applying for ${s.role.title} at ${s.org.name}. Before we go further, we would like to understand a little more:`, ...lines, `Thank you,`, s.org.name], {
      label: "Answer the questions",
      href: url,
    }),
  });
  if (!res.ok) throw new Error(res.error ?? "The email could not be sent.");
  const now = new Date();
  await db.update(questions).set({ status: "sent", sentAt: now, token: t, batchId }).where(inArray(questions.id, qs.map((q) => q.id)));
  await db.insert(messages).values({ applicationId: app.id, direction: "out", channel: "email", subject: `Questions about ${s.role.title}`, body: lines.join("\n"), fromAddress: s.from, sentBy: actorId });
  await audit({ orgId: app.orgId, actorId, action: "questions.send", entity: "application", entityId: app.id, roleId: app.roleId, applicationId: app.id, detail: { count: qs.length } });
  await logActivity({ orgId: app.orgId, roleId: app.roleId, kind: "questions_sent", message: `Sent ${qs.length} question${qs.length === 1 ? "" : "s"} to ${person.name}`, actorId, detail: { applicationId: app.id } });
  await touchRole(app.roleId);
  return qs.length;
}

/**
 * Daily: chase unanswered questions twice, spaced, then stop and record it.
 * Returns what it did, for the activity log.
 */
export async function runFollowups() {
  const now = Date.now();
  const open = await db
    .select({ q: questions, name: persons.name, email: persons.email, orgId: applications.orgId, roleId: applications.roleId, title: roles.title })
    .from(questions)
    .innerJoin(applications, eq(applications.id, questions.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(eq(questions.status, "sent"), eq(roles.state, "open"), or(lt(questions.lastFollowupAt, new Date(now - 2 * 86_400_000)), lt(questions.sentAt, new Date(now - 2 * 86_400_000)))));
  const byToken = new Map<string, typeof open>();
  for (const r of open) if (r.q.token) byToken.set(r.q.token, [...(byToken.get(r.q.token) ?? []), r]);
  let chased = 0;
  let closed = 0;
  for (const [t, group] of byToken) {
    const q = group[0].q;
    const days = (now - (q.sentAt?.getTime() ?? now)) / 86_400_000;
    if (q.followups >= FOLLOWUP_DAYS.length) {
      if (days >= FOLLOWUP_DAYS[FOLLOWUP_DAYS.length - 1] + 3) {
        await db.update(questions).set({ status: "unanswered" }).where(eq(questions.token, t));
        await logActivity({ orgId: group[0].orgId, roleId: group[0].roleId, kind: "questions_unanswered", message: `${group[0].name} did not answer after two follow-ups` });
        closed++;
      }
      continue;
    }
    if (days < FOLLOWUP_DAYS[q.followups]) continue;
    if (!group[0].email) continue;
    const res = await sendEmail({
      to: group[0].email,
      subject: `Following up: your application for ${group[0].title}`,
      text: `Hi ${group[0].name.split(" ")[0]},\n\nA gentle reminder about our questions for ${group[0].title}. You can answer here: ${SITE}/r/${t}\n\nIf you are no longer interested, just let us know on that page.`,
      html: layout([`Hi ${group[0].name.split(" ")[0]},`, `A gentle reminder about our questions for ${group[0].title}.`, "If you are no longer interested, just let us know on that page."], {
        label: "Answer the questions",
        href: `${SITE}/r/${t}`,
      }),
    });
    if (!res.ok) continue;
    await db.update(questions).set({ followups: q.followups + 1, lastFollowupAt: new Date() }).where(eq(questions.token, t));
    await db.insert(messages).values({ applicationId: q.applicationId, direction: "out", channel: "email", subject: "Follow-up", body: `Follow-up ${q.followups + 1} of ${FOLLOWUP_DAYS.length}`, fromAddress: EMAIL_FROM });
    chased++;
  }
  return { chased, closed };
}
