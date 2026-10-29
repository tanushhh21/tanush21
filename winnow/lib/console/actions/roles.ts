"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, hardFilters, memberships, observations, refusedCriteria, requirements, roleAccess, roleSources, roles, rubricVersions, type SourceKind } from "@/lib/db/schema";
import { assertCan, can, requireCtx, requireRole } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { closeRoleWith } from "@/lib/console/roles";
import { enqueue, pump } from "@/lib/console/jobs";
import { extract } from "@/lib/console/parse";
import { aiConfigured } from "@/lib/ai/claude";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.]/g, "");
  return v ? Math.round(Number(v)) : null;
};
/** Accepts "18", "18L", "18 lakh" or "1800000" and returns rupees per year. */
const rupees = (f: FormData, k: string) => {
  const raw = str(f, k).toLowerCase();
  if (!raw) return null;
  const n = Number(raw.replace(/[^\d.]/g, ""));
  if (!n) return null;
  return /l|lakh|lpa/.test(raw) || n < 1000 ? Math.round(n * 100000) : Math.round(n);
};

/** Step 1, the only required step: what is the role. */
export async function createRole(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.createRole);
  const mode = str(form, "mode");
  const fromRoleId = str(form, "fromRoleId");

  if (mode === "past" && fromRoleId) {
    const past = await requireRole(c, fromRoleId);
    const role = await copyRole(c.org.id, c.user.id, past, str(form, "title") || past.title);
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.create", entity: "role", entityId: role.id, roleId: role.id, detail: { from: past.id } });
    redirect(`/console/roles/${role.id}/setup?step=2`);
  }

  let jd = str(form, "jdText");
  const file = form.get("jdFile");
  if (file instanceof File && file.size > 0) {
    const parsed = await extract(file.name, Buffer.from(await file.arrayBuffer()));
    if (!parsed.ok) redirect(`/console/roles/new?error=${encodeURIComponent(parsed.reason)}`);
    jd = parsed.text;
  }
  const intake = str(form, "intake");
  const examples: string[] = [];
  for (const f of form.getAll("examples")) {
    if (f instanceof File && f.size > 0) {
      const p = await extract(f.name, Buffer.from(await f.arrayBuffer()));
      if (p.ok && p.text) examples.push(p.text.slice(0, 6000));
    }
  }
  if (!jd && !intake && examples.length === 0) redirect("/console/roles/new?error=empty");
  const notes = [intake, examples.length ? `People we would hire (examples):\n\n${examples.map((e, i) => `Example ${i + 1}:\n${e}`).join("\n\n")}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const [role] = await db
    .insert(roles)
    .values({ orgId: c.org.id, title: str(form, "title") || "New role", jdText: jd || null, intakeNotes: notes || null, createdBy: c.user.id, sources: [] })
    .returning();
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.create", entity: "role", entityId: role.id, roleId: role.id });
  await logActivity({ orgId: c.org.id, roleId: role.id, kind: "role_created", message: "Role created", actorId: c.user.id });
  if (aiConfigured()) {
    await enqueue("rubric", { orgId: c.org.id, roleId: role.id, payload: { roleId: role.id } });
    after(() => pump(50_000));
  }
  redirect(`/console/roles/${role.id}/setup?step=2`);
}

/** Starting from a past role carries its rubric, filters and sources. */
async function copyRole(orgId: string, userId: string, past: typeof roles.$inferSelect, title: string) {
  return db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({
        orgId,
        title,
        family: past.family,
        locations: past.locations,
        openings: past.openings,
        compMin: past.compMin,
        compMax: past.compMax,
        compShareable: past.compShareable,
        hiringManagerId: past.hiringManagerId,
        visibility: past.visibility,
        questionSender: past.questionSender,
        sources: past.sources,
        jdText: past.jdText,
        intakeNotes: past.intakeNotes,
        fromRoleId: past.id,
        createdBy: userId,
        rubricVersion: past.rubricVersion > 0 ? 1 : 0,
        rubricReviewedAt: past.rubricVersion > 0 ? new Date() : null,
      })
      .returning();
    if (past.rubricVersion > 0) {
      const [from] = await tx.select().from(rubricVersions).where(and(eq(rubricVersions.roleId, past.id), eq(rubricVersions.version, past.rubricVersion)));
      const [v] = await tx.insert(rubricVersions).values({ roleId: role.id, version: 1, origin: "initial", summary: `Started from ${past.title}`, createdBy: userId }).returning();
      const reqs = await tx.select().from(requirements).where(eq(requirements.rubricVersionId, from.id));
      if (reqs.length) await tx.insert(requirements).values(reqs.map(({ id: _id, rubricVersionId: _v, ...q }) => ({ ...q, rubricVersionId: v.id })));
      const refused = await tx.select().from(refusedCriteria).where(eq(refusedCriteria.rubricVersionId, from.id));
      if (refused.length) await tx.insert(refusedCriteria).values(refused.map(({ id: _id, rubricVersionId: _v, ...r }) => ({ ...r, rubricVersionId: v.id })));
    }
    const filters = await tx.select().from(hardFilters).where(eq(hardFilters.roleId, past.id));
    if (filters.length) await tx.insert(hardFilters).values(filters.map(({ id: _id, roleId: _r, createdAt: _c, ...f }) => ({ ...f, roleId: role.id })));
    const sources = await tx.select().from(roleSources).where(eq(roleSources.roleId, past.id));
    if (sources.length) await tx.insert(roleSources).values(sources.map(({ id: _id, roleId: _r, createdAt: _c, lastRunAt: _l, ...s }) => ({ ...s, roleId: role.id })));
    return role;
  });
}

/** Step 2: the basics. */
export async function saveBasics(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, str(form, "roleId"));
  const manager = str(form, "hiringManagerId");
  if (manager) {
    const m = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, c.org.id), eq(memberships.userId, manager)) });
    if (!m) redirect(`/console/roles/${role.id}/setup?step=2&error=manager`);
  }
  await db
    .update(roles)
    .set({
      title: str(form, "title") || role.title,
      family: str(form, "family") || null,
      hiringManagerId: manager || null,
      locations: str(form, "locations")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      openings: Math.max(1, num(form, "openings") ?? 1),
      targetDate: str(form, "targetDate") || null,
      compMin: rupees(form, "compMin"),
      compMax: rupees(form, "compMax"),
      compShareable: form.get("compShareable") === "on",
    })
    .where(eq(roles.id, role.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.basics", entity: "role", entityId: role.id, roleId: role.id });
  redirect(str(form, "next") || `/console/roles/${role.id}/setup?step=3`);
}

export async function markRubricReviewed(form: FormData) {
  const c = await requireCtx();
  const role = await requireRole(c, str(form, "roleId"));
  await db.update(roles).set({ rubricReviewedAt: new Date() }).where(eq(roles.id, role.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "rubric.review", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: role.rubricVersion });
  revalidatePath(`/console/roles/${role.id}`, "layout");
  const next = str(form, "next");
  if (next) redirect(next);
}

/** Step 4: where candidates come from (uploads happen through /api/console/upload). */
export async function saveSources(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageSources);
  const role = await requireRole(c, str(form, "roleId"));
  const picked = form.getAll("sources").map(String) as SourceKind[];
  await db.update(roles).set({ sources: picked }).where(eq(roles.id, role.id));
  if (picked.includes("winnow_sourcing") && !role.sources.includes("winnow_sourcing")) {
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "sourcing_requested", message: "Asked Winnow to source candidates", actorId: c.user.id });
    const { generateSearches } = await import("@/lib/console/operator");
    after(() => generateSearches(role.id));
  }
  redirect(str(form, "next") || `/console/roles/${role.id}/setup?step=5`);
}

/** Step 5: who can see it. */
export async function saveVisibility(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, str(form, "roleId"));
  const visibility = str(form, "visibility") === "restricted" ? "restricted" : "team";
  const people = form.getAll("people").map(String);
  await db.update(roles).set({ visibility }).where(eq(roles.id, role.id));
  await db.delete(roleAccess).where(eq(roleAccess.roleId, role.id));
  const keep = new Set([...people, c.user.id, ...(role.hiringManagerId ? [role.hiringManagerId] : [])]);
  if (visibility === "restricted") await db.insert(roleAccess).values([...keep].map((userId) => ({ roleId: role.id, userId })));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.visibility", entity: "role", entityId: role.id, roleId: role.id, detail: { visibility, people: [...keep] } });
  redirect(str(form, "next") || `/console/roles/${role.id}`);
}

/** Who candidate questions come from, for this role. */
export async function setQuestionSender(roleId: string, mode: "company" | "winnow") {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, roleId);
  await db.update(roles).set({ questionSender: mode }).where(eq(roles.id, role.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.question_sender", entity: "role", entityId: role.id, roleId: role.id, detail: { mode } });
  revalidatePath(`/console/roles/${role.id}/verify`);
}

// ---- Role settings ----------------------------------------------------------

const settingsPath = (roleId: string, saved: string) => `/console/roles/${roleId}/settings?saved=${saved}`;

/** A source and what it cost, so Analytics can show cost per hire by source. */
export async function saveRoleSource(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageSources);
  const role = await requireRole(c, str(form, "roleId"));
  const id = str(form, "id");
  const kind = (str(form, "kind") || "upload") as SourceKind;
  const label = str(form, "label").slice(0, 120);
  const costInr = Math.max(0, rupees(form, "costInr") ?? 0);
  if (!label) redirect(settingsPath(role.id, "source-missing"));
  if (id) await db.update(roleSources).set({ kind, label, costInr }).where(and(eq(roleSources.id, id), eq(roleSources.roleId, role.id)));
  else await db.insert(roleSources).values({ roleId: role.id, kind, label, costInr });
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.source", entity: "role", entityId: role.id, roleId: role.id, detail: { kind, label, costInr } });
  redirect(settingsPath(role.id, "sources"));
}

export async function deleteRoleSource(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageSources);
  const role = await requireRole(c, str(form, "roleId"));
  await db.delete(roleSources).where(and(eq(roleSources.id, str(form, "id")), eq(roleSources.roleId, role.id)));
  redirect(settingsPath(role.id, "sources"));
}

/**
 * Closing asks why, and when the role was filled, who was hired: the most
 * valuable fact the system can learn (it calibrates the rubric for next time).
 */
export async function closeRole(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, str(form, "roleId"));
  const reason = str(form, "reason") as "filled" | "cancelled" | "on_hold";
  if (!["filled", "cancelled", "on_hold"].includes(reason)) redirect(settingsPath(role.id, "reason-missing"));
  const hired = form.getAll("hired").map(String).filter(Boolean);
  const valid = hired.length
    ? await db
        .select({ id: applications.id, personId: applications.personId })
        .from(applications)
        .where(and(eq(applications.roleId, role.id)))
    : [];
  const picks = valid.filter((v) => hired.includes(v.id));
  if (reason === "filled" && picks.length === 0 && form.get("unknownHire") !== "on") redirect(settingsPath(role.id, "hire-missing"));
  await closeRoleWith(c, role, reason, picks.map((p) => p.id), str(form, "note"));
  revalidatePath("/console", "layout");
  redirect(settingsPath(role.id, reason === "on_hold" ? "held" : "closed"));
}

export async function reopenRole(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, str(form, "roleId"));
  await db.update(roles).set({ state: "open", closeReason: null, lastChangeAt: new Date() }).where(eq(roles.id, role.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.reopen", entity: "role", entityId: role.id, roleId: role.id });
  await logActivity({ orgId: c.org.id, roleId: role.id, kind: "role_reopened", message: "Reopened the role", actorId: c.user.id });
  revalidatePath("/console", "layout");
  redirect(settingsPath(role.id, "reopened"));
}

export async function setQuestionSenderForm(form: FormData) {
  const roleId = str(form, "roleId");
  await setQuestionSender(roleId, str(form, "questionSender") === "company" ? "company" : "winnow");
  redirect(settingsPath(roleId, "sender"));
}
