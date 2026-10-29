"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, companyFacts, observations, roles, type FactGroup } from "@/lib/db/schema";
import { assertCan, can, requireCtx } from "@/lib/console/context";
import { audit } from "@/lib/console/log";
import { GROUPS, inferBeliefs } from "@/lib/console/brain";
import { learnCompany } from "@/lib/ai/tasks";
import { AiError, aiConfigured } from "@/lib/ai/claude";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });
const done = () => revalidatePath("/console/settings/knowledge");

async function mine(id: string) {
  const c = await requireCtx();
  assertCan(c, can.editRubric, "Only the TA team edits the company brain.");
  const f = await db.query.companyFacts.findFirst({ where: and(eq(companyFacts.id, id), eq(companyFacts.orgId, c.org.id)) });
  if (!f) throw new Error("Not found.");
  return { c, f };
}

/** Every correction is a learning signal: it is recorded as an observation. */
async function signal(orgId: string, userId: string, payload: Record<string, unknown>) {
  await db.insert(observations).values({ orgId, kind: "brain_correction", payload, createdBy: userId });
}

export async function editBelief(id: string, text: string): Promise<Result> {
  try {
    const { c, f } = await mine(id);
    const t = text.trim().slice(0, 500);
    if (!t) throw new Error("Write the belief, or reject it instead.");
    await db.update(companyFacts).set({ text: t, provenance: "told", confidence: 1, active: true, updatedBy: c.user.id, updatedAt: new Date() }).where(eq(companyFacts.id, f.id));
    await signal(c.org.id, c.user.id, { action: "edit", group: f.group, before: f.text, after: t, was: f.provenance });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "brain.edit", entity: "company_fact", entityId: f.id, detail: { before: f.text, after: t } });
    done();
    return { ok: true, message: "Saved. Winnow uses this from now on." };
  } catch (e) {
    return fail(e);
  }
}

export async function setBeliefActive(id: string, active: boolean): Promise<Result> {
  try {
    const { c, f } = await mine(id);
    await db.update(companyFacts).set({ active, updatedBy: c.user.id, updatedAt: new Date() }).where(eq(companyFacts.id, f.id));
    await signal(c.org.id, c.user.id, { action: active ? "restore" : "reject", group: f.group, text: f.text, was: f.provenance, confidence: f.confidence });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: active ? "brain.restore" : "brain.reject", entity: "company_fact", entityId: f.id });
    done();
    return { ok: true, message: active ? "Restored" : "Marked as wrong. Winnow will not use it." };
  } catch (e) {
    return fail(e);
  }
}

export async function addBelief(group: string, text: string): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric, "Only the TA team edits the company brain.");
    if (!GROUPS.some((g) => g.key === group)) throw new Error("Pick a group.");
    const t = text.trim().slice(0, 500);
    if (!t) throw new Error("Write the belief.");
    const [f] = await db.insert(companyFacts).values({ orgId: c.org.id, group: group as FactGroup, text: t, provenance: "told", confidence: 1, updatedBy: c.user.id }).returning();
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "brain.add", entity: "company_fact", entityId: f.id, detail: { group, text: t } });
    done();
    return { ok: true, message: "Added" };
  } catch (e) {
    return fail(e);
  }
}

/** Reads every job description and intake note for beliefs about the company itself. */
export async function learnFromRoles(): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    if (!aiConfigured()) throw new Error("This needs the AI connected (GROQ_API_KEY or ANTHROPIC_API_KEY).");
    const rs = await db.select({ title: roles.title, jd: roles.jdText, notes: roles.intakeNotes }).from(roles).where(eq(roles.orgId, c.org.id));
    const text = rs
      .filter((r) => r.jd || r.notes)
      .map((r) => `# ${r.title}\n${r.jd ?? ""}\n${r.notes ?? ""}`)
      .join("\n\n");
    if (!text) throw new Error("Add a role with a job description first.");
    const out = await learnCompany(text);
    // Replace earlier beliefs read from job descriptions, except any a person has touched.
    await db.delete(companyFacts).where(and(eq(companyFacts.orgId, c.org.id), like(companyFacts.key, "jd:%"), isNull(companyFacts.updatedBy)));
    const touched = await db.select({ key: companyFacts.key }).from(companyFacts).where(and(eq(companyFacts.orgId, c.org.id), like(companyFacts.key, "jd:%"), isNotNull(companyFacts.updatedBy)));
    const taken = new Set(touched.map((t) => t.key));
    let n = 0;
    for (const [i, b] of out.data.beliefs.slice(0, 15).entries()) {
      const key = `jd:${b.group}:${i}:${b.text.slice(0, 40).toLowerCase().replace(/\W+/g, "-")}`;
      if (taken.has(key)) continue;
      await db
        .insert(companyFacts)
        .values({ orgId: c.org.id, key, group: b.group, text: b.text.slice(0, 500), evidence: `“${b.quote.slice(0, 300)}” (from your job descriptions)`, confidence: Math.max(0, Math.min(1, b.confidence)), provenance: "inferred" })
        .onConflictDoNothing();
      n++;
    }
    await db.insert(activity).values({ orgId: c.org.id, kind: "brain_learned", message: `Read your job descriptions: ${n} beliefs about the company`, costUsd: out.costUsd, actorId: c.user.id });
    await inferBeliefs(c.org.id);
    done();
    return { ok: true, message: `Read ${rs.length} role${rs.length === 1 ? "" : "s"}: ${n} beliefs to check.` };
  } catch (e) {
    return fail(e instanceof AiError ? new Error(e.message) : e);
  }
}

export async function refreshInferred(): Promise<Result> {
  try {
    const c = await requireCtx();
    const n = await inferBeliefs(c.org.id);
    done();
    return { ok: true, message: n ? `${n} beliefs from your decisions are up to date.` : "Not enough decisions yet to infer anything." };
  } catch (e) {
    return fail(e);
  }
}

