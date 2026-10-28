"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, availabilityLinks, interviews, messages, orgs, persons, roles, users } from "@/lib/db/schema";
import { EMAIL_FROM, layout, sendEmail } from "@/lib/console/email";
import { ics, ist } from "@/lib/console/ics";
import { logActivity } from "@/lib/console/log";
import { touchRole } from "@/lib/console/roles";
import { notify } from "@/lib/console/notify";

/** The candidate picks a time from their link. The token is the only key. */
export async function bookSlot(form: FormData) {
  const token = String(form.get("token") ?? "");
  const pick = Number(form.get("slot"));
  if (!/^[\w-]{10,64}$/.test(token)) redirect("/s/invalid");
  const link = await db.query.availabilityLinks.findFirst({ where: and(eq(availabilityLinks.token, token), eq(availabilityLinks.status, "sent")) });
  if (!link) redirect(`/s/${token}?done=1`);
  const slot = link.slots[pick];
  if (!slot || new Date(slot.start).getTime() < Date.now()) redirect(`/s/${token}?gone=1`);
  // Claim the link first, so a double submit cannot book twice.
  const claimed = await db.update(availabilityLinks).set({ status: "booked" }).where(and(eq(availabilityLinks.id, link.id), eq(availabilityLinks.status, "sent"))).returning();
  if (claimed.length === 0) redirect(`/s/${token}?done=1`);

  const app = await db.query.applications.findFirst({ where: eq(applications.id, link.applicationId) });
  const role = await db.query.roles.findFirst({ where: eq(roles.id, link.roleId) });
  const person = app && (await db.query.persons.findFirst({ where: eq(persons.id, app.personId) }));
  const org = role && (await db.query.orgs.findFirst({ where: eq(orgs.id, role.orgId) }));
  const interviewer = link.interviewerId ? await db.query.users.findFirst({ where: eq(users.id, link.interviewerId) }) : null;
  if (!app || !role || !person || !org) redirect("/s/invalid");

  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const [iv] = await db.insert(interviews).values({ applicationId: app.id, roleId: role.id, interviewerId: link.interviewerId, startAt: start, endAt: end, linkId: link.id }).returning();
  await db.update(applications).set({ stage: "interviewing", stageChangedAt: new Date() }).where(eq(applications.id, app.id));
  await db.insert(messages).values({ applicationId: app.id, direction: "in", channel: "reply_page", subject: "Interview time", body: `Picked ${ist(start)} (India time).` });

  const title = `Interview: ${person.name} for ${role.title}`;
  const invite = ics({
    uid: iv.id,
    start,
    end,
    title,
    description: `${org.name} interview for ${role.title}.`,
    organizer: EMAIL_FROM.match(/<(.+)>/)?.[1] ?? "hello@getwinnow.in",
    attendees: [person.email, interviewer?.email].filter(Boolean) as string[],
  });
  const attach = [{ filename: "interview.ics", content: invite, contentType: "text/calendar; method=REQUEST" }];
  if (person.email)
    await sendEmail({
      to: person.email,
      subject: `Confirmed: interview for ${role.title}, ${ist(start)}`,
      text: `Your interview for ${role.title} at ${org.name} is confirmed for ${ist(start)} (India time). The calendar invite is attached; we will remind you the day before.`,
      html: layout([`Your interview for ${role.title} at ${org.name} is confirmed for ${ist(start)} (India time).`, "The calendar invite is attached. We will remind you the day before."]),
      attachments: attach,
    });
  if (interviewer?.email)
    await sendEmail({ to: interviewer.email, subject: title, text: `${person.name} picked ${ist(start)} (India time). The invite is attached.`, attachments: attach });
  await logActivity({ orgId: org.id, roleId: role.id, kind: "interview_booked", message: `${person.name} booked an interview for ${ist(start)}`, detail: { applicationId: app.id } });
  if (link.interviewerId) await notify(org.id, [link.interviewerId], "interview_booked", `${person.name} booked ${ist(start)} for ${role.title}`, `/console/roles/${role.id}/interviews`);
  await touchRole(role.id);
  redirect(`/s/${token}?done=1`);
}
