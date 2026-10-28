"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, observations, questions, roles } from "@/lib/db/schema";
import { Forbidden, can, requireCtx, visibleRoles } from "@/lib/console/context";
import { sendFor } from "@/lib/console/questions";
import { audit, logActivity } from "@/lib/console/log";

type Result = { ok: true; sent?: number; failed?: string[] } | { ok: false; error: string };

async function apps(ids: string[]) {
  const c = await requireCtx();
  if (!can.sendQuestions(c)) throw new Forbidden("Only the TA team can send questions.");
  const rows = await db
    .select({ app: applications, role: roles })
    .from(applications)
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(inArray(applications.id, ids), visibleRoles(c)));
  return { c, rows };
}

export type Draft = { applicationId: string; kind?: "question" | "work_sample" | "reference"; items: { requirementKey: string | null; text: string }[] };

/** Saves questions as drafts, and sends them now if asked to. */
export async function askQuestions(drafts: Draft[], sendNow: boolean): Promise<Result> {
  try {
    const { c, rows } = await apps(drafts.map((d) => d.applicationId));
    const allowed = new Map(rows.map((r) => [r.app.id, r]));
    for (const d of drafts) {
      const r = allowed.get(d.applicationId);
      const items = d.items.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text);
      if (!r || items.length === 0) continue;
      await db.insert(questions).values(items.map((i) => ({ applicationId: r.app.id, roleId: r.role.id, kind: d.kind ?? "question", requirementKey: i.requirementKey, text: i.text.slice(0, 600), createdBy: c.user.id })));
    }
    let sent = 0;
    const failed: string[] = [];
    if (sendNow) {
      for (const id of allowed.keys()) {
        try {
          sent += await sendFor(id, c.user.id);
        } catch (e) {
          failed.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    const roleId = rows[0]?.role.id;
    if (roleId) revalidatePath(`/console/roles/${roleId}`, "layout");
    return { ok: true, sent, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Sends every drafted question for these candidates (from Verify or needs-you). */
export async function sendDrafted(applicationIds: string[]): Promise<Result> {
  try {
    const { c, rows } = await apps(applicationIds);
    let sent = 0;
    const failed: string[] = [];
    for (const r of rows) {
      try {
        sent += await sendFor(r.app.id, c.user.id);
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (rows[0]) revalidatePath(`/console/roles/${rows[0].role.id}`, "layout");
    return { ok: true, sent, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Asked by phone or in person: recorded so it is not asked twice. */
export async function markAskedOutside(applicationId: string, text: string, answer: string): Promise<Result> {
  try {
    const { c, rows } = await apps([applicationId]);
    const r = rows[0];
    if (!r) throw new Error("Not found.");
    await db.insert(questions).values({
      applicationId,
      roleId: r.role.id,
      text: text.trim() || "Asked outside Winnow",
      status: answer.trim() ? "answered" : "asked_outside",
      answer: answer.trim() || null,
      answeredAt: answer.trim() ? new Date() : null,
      createdBy: c.user.id,
    });
    if (answer.trim()) {
      await db.insert(observations).values({ orgId: c.org.id, kind: "answer", personId: r.app.personId, applicationId, roleId: r.role.id, payload: { question: text, answer, channel: "outside" }, createdBy: c.user.id });
      const { reresolve } = await import("@/lib/console/replies");
      await reresolve(applicationId, `Asked outside Winnow: ${text}\nAnswer: ${answer}`);
    }
    revalidatePath(`/console/roles/${r.role.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Verify: skip a candidate with a reason (kept, so the worklist stays honest). */
export async function skipVerification(applicationId: string, reason: string): Promise<Result> {
  try {
    const { c, rows } = await apps([applicationId]);
    const r = rows[0];
    if (!r || !reason.trim()) throw new Error("Give a reason to skip.");
    await db.insert(questions).values({ applicationId, roleId: r.role.id, text: "Verification skipped", status: "skipped", skipReason: reason.slice(0, 300), createdBy: c.user.id });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "verify.skip", entity: "application", entityId: applicationId, roleId: r.role.id, applicationId, detail: { reason } });
    await logActivity({ orgId: c.org.id, roleId: r.role.id, kind: "verify_skipped", message: "Skipped verification for a candidate", actorId: c.user.id, detail: { reason } });
    revalidatePath(`/console/roles/${r.role.id}/verify`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function discardDraft(questionId: string): Promise<Result> {
  const c = await requireCtx();
  if (!can.sendQuestions(c)) return { ok: false, error: "Not allowed." };
  const q = await db.query.questions.findFirst({ where: eq(questions.id, questionId) });
  if (!q || q.status !== "drafted") return { ok: false, error: "Not found." };
  const [ok] = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.id, q.roleId), visibleRoles(c)));
  if (!ok) return { ok: false, error: "Not found." };
  await db.delete(questions).where(eq(questions.id, questionId));
  revalidatePath(`/console/roles/${q.roleId}`, "layout");
  return { ok: true };
}
