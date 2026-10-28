"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, messages, observations, questions, roles } from "@/lib/db/schema";
import { notify } from "@/lib/console/notify";
import { reresolve } from "@/lib/console/replies";
import { touchRole } from "@/lib/console/roles";

/** A candidate's answers, from the public reply page. The token is the only key. */
export async function submitReply(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[\w-]{10,64}$/.test(token)) redirect("/r/invalid");
  const qs = await db.select().from(questions).where(and(eq(questions.token, token), inArray(questions.status, ["sent", "unanswered"])));
  if (qs.length === 0) redirect(`/r/${token}?done=1`);
  const app = await db.query.applications.findFirst({ where: eq(applications.id, qs[0].applicationId) });
  const role = app && (await db.query.roles.findFirst({ where: eq(roles.id, app.roleId) }));
  if (!app || !role) redirect("/r/invalid");

  const notInterested = form.get("notInterested") === "on";
  const now = new Date();
  const pairs: string[] = [];
  for (const q of qs) {
    const a = String(form.get(`a_${q.id}`) ?? "").trim().slice(0, 4000);
    if (!a && !notInterested) continue;
    await db.update(questions).set({ status: "answered", answer: a || "(No longer interested)", answeredAt: now }).where(eq(questions.id, q.id));
    if (a) pairs.push(`Q: ${q.text}\nA: ${a}`);
  }
  if (pairs.length === 0 && !notInterested) redirect(`/r/${token}?empty=1`);
  await db
    .update(applications)
    .set({ lastReplyAt: now, interest: notInterested ? "not_interested" : "interested" })
    .where(eq(applications.id, app.id));
  await db.insert(messages).values({ applicationId: app.id, direction: "in", channel: "reply_page", subject: "Answers", body: notInterested ? "No longer interested." + (pairs.length ? `\n\n${pairs.join("\n\n")}` : "") : pairs.join("\n\n") });
  await db.insert(observations).values({ orgId: app.orgId, kind: "answer", personId: app.personId, applicationId: app.id, roleId: role.id, payload: { answers: pairs, notInterested } });
  await touchRole(role.id);
  await notify(app.orgId, [role.createdBy ?? "", role.hiringManagerId ?? ""], "candidate_replied", `A candidate replied on ${role.title}`, `/console/c/${app.id}#communication`);
  if (pairs.length) await reresolve(app.id, pairs.join("\n\n"));
  redirect(`/r/${token}?done=1`);
}
