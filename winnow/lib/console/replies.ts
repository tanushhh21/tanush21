/**
 * When a candidate answers, the answer becomes an artifact on their record and
 * their verdicts are re-resolved with it. The score may move because more is
 * now known; the change is recorded with its cause.
 */
import { and, desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { applications, documents, evaluations, roles } from "@/lib/db/schema";
import { enqueue, pump } from "./jobs";
import { logActivity } from "./log";

export async function reresolve(applicationId: string, answerText: string) {
  const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!app) return;
  const role = await db.query.roles.findFirst({ where: eq(roles.id, app.roleId) });
  const cv = await db.query.documents.findFirst({ where: and(eq(documents.applicationId, app.id), eq(documents.kind, "cv")), orderBy: [desc(documents.createdAt)] });
  if (!role || !cv) return;
  const before = await db.query.evaluations.findFirst({ where: and(eq(evaluations.applicationId, app.id), eq(evaluations.rubricVersion, role.rubricVersion)) });
  // Answers are appended to the text the evaluation reads, clearly labelled.
  await db
    .update(documents)
    .set({ text: `${cv.text ?? ""}\n\n--- Answers from the candidate (${new Date().toISOString().slice(0, 10)}) ---\n${answerText}` })
    .where(eq(documents.id, cv.id));
  await db.insert(documents).values({ orgId: app.orgId, personId: app.personId, applicationId: app.id, roleId: role.id, kind: "answer", filename: "Answers", mime: "text/plain", size: answerText.length, text: answerText, parseStatus: "parsed" });
  if (role.rubricVersion > 0) {
    await enqueue("score", { orgId: app.orgId, roleId: role.id, payload: { applicationId: app.id, version: role.rubricVersion, cause: "answer", before: before?.score ?? null } });
    try {
      after(() => pump(45_000));
    } catch {
      // Not inside a request (tests): the next progress poll picks it up.
    }
  }
  await logActivity({ orgId: app.orgId, roleId: role.id, kind: "reply_received", message: "A candidate answered; re-scoring with the answer", detail: { applicationId: app.id, scoreBefore: before?.score ?? null } });
}
