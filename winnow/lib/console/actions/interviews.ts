"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, availabilityLinks, debriefs, interviews, messages, observations, persons, roles, type Slot } from "@/lib/db/schema";
import { can, requireCtx, visibleRoles } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { layout, sendEmail } from "@/lib/console/email";
import { SITE, token } from "@/lib/console/invites";
import { fromIst, ist } from "@/lib/console/ics";
import { touchRole } from "@/lib/console/roles";
import { notify } from "@/lib/console/notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

async function visibleApp(applicationId: string) {
  const c = await requireCtx();
  const [row] = await db
    .select({ app: applications, role: roles, person: persons })
    .from(applications)
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(eq(applications.id, applicationId), visibleRoles(c)));
  if (!row) throw new Error("Not found.");
  return { c, ...row };
}

/** Sends a candidate a link to pick one of these slots (typed in India time). */
export async function sendAvailability(applicationId: string, interviewerId: string, localSlots: string[], minutes: number): Promise<Result> {
  try {
    const { c, app, role, person } = await visibleApp(applicationId);
    if (!can.manageSources(c) && c.user.id !== role.hiringManagerId) throw new Error("Only the TA team or the hiring manager can schedule.");
    if (role.state !== "open") throw new Error("This role is not open, so nothing is sent.");
    if (!person.email) throw new Error(`No email address for ${person.name}.`);
    if (person.consent === "withdrawn") throw new Error(`${person.name} withdrew consent, so Winnow will not contact them.`);
    const slots: Slot[] = localSlots
      .filter(Boolean)
      .map((l) => fromIst(l))
      .filter((d) => d.getTime() > Date.now())
      .sort((a, b) => a.getTime() - b.getTime())
      .map((d) => ({ start: d.toISOString(), end: new Date(d.getTime() + minutes * 60_000).toISOString() }));
    if (slots.length === 0) throw new Error("Add at least one time in the future.");
    const t = token(18);
    await db.insert(availabilityLinks).values({ roleId: role.id, applicationId: app.id, interviewerId: interviewerId || null, slots, minutes, token: t, createdBy: c.user.id });
    const url = `${SITE}/s/${t}`;
    const first = person.name.split(" ")[0];
    const res = await sendEmail({
      to: person.email,
      subject: `Interview for ${role.title}: pick a time`,
      text: `Hi ${first},\n\nWe would like to invite you to a ${minutes}-minute interview for ${role.title} at ${c.org.name}. Pick a time that suits you: ${url}\n\nOptions (India time):\n${slots.map((s) => `- ${ist(s.start)}`).join("\n")}`,
      html: layout([`Hi ${first},`, `We would like to invite you to a ${minutes}-minute interview for ${role.title} at ${c.org.name}.`, `Options (India time): ${slots.map((s) => ist(s.start)).join("; ")}.`], { label: "Pick a time", href: url }),
    });
    if (!res.ok) throw new Error(res.error ?? "The email could not be sent.");
    await db.insert(messages).values({ applicationId: app.id, direction: "out", channel: "email", subject: "Interview times", body: `Offered ${slots.length} time${slots.length === 1 ? "" : "s"} for a ${minutes}-minute interview.`, sentBy: c.user.id });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "availability_sent", message: `Sent interview times to ${person.name}`, actorId: c.user.id, detail: { applicationId } });
    await touchRole(role.id);
    revalidatePath(`/console/roles/${role.id}/interviews`);
    return { ok: true, message: `Sent ${slots.length} time${slots.length === 1 ? "" : "s"} to ${person.name}` };
  } catch (e) {
    return fail(e);
  }
}

/** Records an interview agreed outside Winnow (by phone, say). */
export async function bookDirect(applicationId: string, interviewerId: string, local: string, minutes: number): Promise<Result> {
  try {
    const { c, app, role, person } = await visibleApp(applicationId);
    const start = fromIst(local);
    if (Number.isNaN(start.getTime())) throw new Error("Pick a date and time.");
    await db.insert(interviews).values({ applicationId: app.id, roleId: role.id, interviewerId: interviewerId || null, startAt: start, endAt: new Date(start.getTime() + minutes * 60_000) });
    await db.update(applications).set({ stage: "interviewing", stageChangedAt: new Date() }).where(eq(applications.id, app.id));
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "interview_booked", message: `Interview with ${person.name} on ${ist(start)}`, actorId: c.user.id });
    await touchRole(role.id);
    revalidatePath(`/console/roles/${role.id}/interviews`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markInterview(interviewId: string, status: "done" | "no_show" | "cancelled" | "rescheduled"): Promise<Result> {
  try {
    const c = await requireCtx();
    const iv = await db.query.interviews.findFirst({ where: eq(interviews.id, interviewId) });
    if (!iv) throw new Error("Not found.");
    const { role, person } = await visibleApp(iv.applicationId);
    await db
      .update(interviews)
      .set({ status, reschedules: status === "rescheduled" ? iv.reschedules + 1 : iv.reschedules })
      .where(eq(interviews.id, iv.id));
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: `interview_${status}`, message: `Interview with ${person.name}: ${status.replace("_", " ")}`, actorId: c.user.id });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: `interview.${status}`, entity: "interview", entityId: iv.id, roleId: role.id, applicationId: iv.applicationId });
    revalidatePath(`/console/roles/${role.id}/interviews`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The thirty-second debrief: the only way interview signal enters the system. */
export async function saveDebrief(interviewId: string, wouldHire: "strong_yes" | "yes" | "no" | "strong_no", strongest: string, concern: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const iv = await db.query.interviews.findFirst({ where: eq(interviews.id, interviewId) });
    if (!iv) throw new Error("Not found.");
    const { app, role, person } = await visibleApp(iv.applicationId);
    await db.insert(debriefs).values({ interviewId: iv.id, applicationId: app.id, authorId: c.user.id, wouldHire, strongest: strongest.slice(0, 1000) || null, concern: concern.slice(0, 1000) || null });
    if (iv.status === "scheduled") await db.update(interviews).set({ status: "done" }).where(eq(interviews.id, iv.id));
    await db.insert(observations).values({ orgId: c.org.id, kind: "debrief", personId: app.personId, applicationId: app.id, roleId: role.id, payload: { wouldHire, strongest, concern, interviewId: iv.id }, createdBy: c.user.id });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "debrief.record", entity: "interview", entityId: iv.id, roleId: role.id, applicationId: app.id, detail: { wouldHire } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "debrief", message: `Debrief on ${person.name}: ${wouldHire.replace("_", " ")}`, actorId: c.user.id });
    await touchRole(role.id);
    revalidatePath(`/console/roles/${role.id}/interviews`);
    return { ok: true, message: "Debrief recorded" };
  } catch (e) {
    return fail(e);
  }
}

/** Moves a candidate to the offer stage (the offer itself lives in the ATS). */
export async function setStage(applicationId: string, stage: "interviewing" | "offer" | "hired"): Promise<Result> {
  try {
    const { c, app, role, person } = await visibleApp(applicationId);
    await db
      .update(applications)
      .set({ stage, stageChangedAt: new Date(), ...(stage === "hired" ? { acceptedAt: app.acceptedAt ?? new Date() } : {}) })
      .where(eq(applications.id, app.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: `stage.${stage}`, entity: "application", entityId: app.id, roleId: role.id, applicationId: app.id, rubricVersion: role.rubricVersion });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "stage", message: `${person.name}: ${stage}`, actorId: c.user.id });
    if (stage === "hired") await db.insert(observations).values({ orgId: c.org.id, kind: "outcome", personId: app.personId, applicationId: app.id, roleId: role.id, payload: { hired: true }, createdBy: c.user.id });
    await touchRole(role.id);
    revalidatePath(`/console/roles/${role.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The day they actually joined: the only hire that counts in Analytics. */
export async function markJoined(applicationId: string): Promise<Result> {
  try {
    const { c, app, role, person } = await visibleApp(applicationId);
    if (app.stage !== "hired") throw new Error("Mark them hired first.");
    await db.update(applications).set({ joinedAt: new Date() }).where(eq(applications.id, app.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "stage.joined", entity: "application", entityId: app.id, roleId: role.id, applicationId: app.id });
    await db.insert(observations).values({ orgId: c.org.id, kind: "outcome", personId: app.personId, applicationId: app.id, roleId: role.id, payload: { joined: true }, createdBy: c.user.id });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "stage", message: `${person.name} joined`, actorId: c.user.id });
    revalidatePath(`/console/roles/${role.id}`, "layout");
    return { ok: true, message: `${person.name} joined` };
  } catch (e) {
    return fail(e);
  }
}

/** Interviewer reminders for debriefs that are due. */
export async function remindDebrief(interviewId: string): Promise<Result> {
  const c = await requireCtx();
  const iv = await db.query.interviews.findFirst({ where: eq(interviews.id, interviewId) });
  if (!iv?.interviewerId) return { ok: false, error: "No interviewer set." };
  const role = await db.query.roles.findFirst({ where: eq(roles.id, iv.roleId) });
  await notify(c.org.id, [iv.interviewerId], "debrief_due", `Thirty seconds: your debrief for ${role?.title ?? "an interview"}`, `/console/roles/${iv.roleId}/interviews?debrief=${iv.id}`);
  return { ok: true, message: "Reminder sent" };
}

