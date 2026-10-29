"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, chatMessages, hardFilters, refusedCriteria, type ChatDiff } from "@/lib/db/schema";
import { assertCan, can, requireCtx, requireRole } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { applyChanges, createVersion, impactOf, type ReqInput, type RubricChange } from "@/lib/console/rubric";
import { currentRequirements, rankRole } from "@/lib/console/scoring";
import { applyHardFilters, describe, FILTER_FIELDS } from "@/lib/console/filters";
import { pump } from "@/lib/console/jobs";
import { loadRanking } from "@/lib/console/data/ranking";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });
const path = (roleId: string) => {
  revalidatePath(`/console/roles/${roleId}`, "layout");
  revalidatePath("/console/chat");
};

export async function previewRubric(roleId: string, items: (ReqInput & { key: string })[]) {
  const c = await requireCtx();
  const role = await requireRole(c, roleId);
  return impactOf(role.id, items);
}

/** Saves an edited rubric as a new version; old scores are kept. */
export async function saveRubric(roleId: string, items: ReqInput[], summary: string, addedAnyway: string[] = []): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric, "Only the TA team can change the rubric.");
    const role = await requireRole(c, roleId);
    const v = await createVersion(role.id, items, "edit", summary || "Edited by hand", c.user.id);
    if (addedAnyway.length) {
      await db.update(refusedCriteria).set({ addedAnyway: true, addedBy: c.user.id, addedAt: new Date() }).where(inArray(refusedCriteria.id, addedAnyway));
      await logActivity({ orgId: c.org.id, roleId: role.id, kind: "bias_flag", message: `Added ${addedAnyway.length} criteri${addedAnyway.length === 1 ? "on" : "a"} Winnow advised against, with a bias flag`, actorId: c.user.id });
    }
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "rubric.edit", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: v.version, detail: { summary, items, addedAnyway } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "rubric_changed", message: `Rubric v${v.version}: ${summary || "edited"}${v.changed ? `, ${v.changed} requirement${v.changed === 1 ? "" : "s"} to re-read` : ""}`, actorId: c.user.id });
    after(() => pump(50_000));
    path(role.id);
    return { ok: true, message: `Saved as v${v.version}. Re-scoring now.` };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreVersion(roleId: string, version: number): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    const role = await requireRole(c, roleId);
    const old = await currentRequirements(role.id, version);
    if (old.length === 0) throw new Error("That version has no requirements.");
    const v = await createVersion(
      role.id,
      old.map((q) => ({ key: q.key, text: q.text, weight: q.weight, mustHave: q.mustHave, keywords: q.keywords, minYears: q.minYears, recencySensitive: q.recencySensitive, origin: q.origin, sourceSentence: q.sourceSentence })),
      "restore",
      `Restored v${version}`,
      c.user.id,
    );
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "rubric.restore", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: v.version, detail: { from: version } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "rubric_changed", message: `Restored v${version} as v${v.version}`, actorId: c.user.id });
    after(() => pump(50_000));
    path(role.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---- Hard filters ----------------------------------------------------------------

async function refilter(roleId: string, version: number) {
  const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.roleId, roleId));
  await applyHardFilters(roleId, apps.map((a) => a.id), version);
  await rankRole(roleId, version);
}

export async function addFilter(roleId: string, field: string, op: string, value: string): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    const role = await requireRole(c, roleId);
    const meta = FILTER_FIELDS[field];
    if (!meta || !["lte", "gte", "eq", "neq", "in", "contains"].includes(op) || !value.trim()) throw new Error("Choose a field, a condition and a value.");
    let v: string | number | string[] = value.trim();
    if (meta.numeric) {
      const n = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isNaN(n)) throw new Error("Enter a number.");
      v = field.endsWith("ctc") && n < 1000 ? Math.round(n * 100000) : n;
    } else if (op === "in") v = value.split(",").map((s) => s.trim()).filter(Boolean);
    const [f] = await db.insert(hardFilters).values({ roleId: role.id, field, op: op as "lte", value: v, createdBy: c.user.id }).returning();
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "filter.add", entity: "hard_filter", entityId: f.id, roleId: role.id, detail: { field, op, value: v } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "filter_changed", message: `Hard filter added: ${describe(f)}`, actorId: c.user.id });
    await refilter(role.id, role.rubricVersion);
    path(role.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleFilter(filterId: string, active: boolean): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    const f = await db.query.hardFilters.findFirst({ where: eq(hardFilters.id, filterId) });
    if (!f) throw new Error("Not found.");
    const role = await requireRole(c, f.roleId);
    await db.update(hardFilters).set({ active }).where(eq(hardFilters.id, f.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: active ? "filter.on" : "filter.off", entity: "hard_filter", entityId: f.id, roleId: role.id });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "filter_changed", message: `Hard filter ${active ? "on" : "off"}: ${describe(f)}`, actorId: c.user.id });
    await refilter(role.id, role.rubricVersion);
    path(role.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFilter(filterId: string): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    const f = await db.query.hardFilters.findFirst({ where: eq(hardFilters.id, filterId) });
    if (!f) throw new Error("Not found.");
    const role = await requireRole(c, f.roleId);
    await db.delete(hardFilters).where(eq(hardFilters.id, f.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "filter.delete", entity: "hard_filter", entityId: f.id, roleId: role.id, detail: { field: f.field, op: f.op, value: f.value } });
    await refilter(role.id, role.rubricVersion);
    path(role.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---- Role chat ------------------------------------------------------------------------


/** Applies a proposed chat diff: a new rubric version whose origin is the chat. */
export async function applyChatDiff(messageId: string): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.editRubric);
    const m = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, messageId) });
    if (!m?.roleId || !m.diff || m.diffState !== "proposed" || m.orgId !== c.org.id) throw new Error("Nothing to apply.");
    const role = await requireRole(c, m.roleId);
    const current = (await currentRequirements(role.id, role.rubricVersion)).map((q) => ({
      key: q.key,
      text: q.text,
      weight: q.weight,
      mustHave: q.mustHave,
      keywords: q.keywords,
      minYears: q.minYears,
      recencySensitive: q.recencySensitive,
      origin: q.origin,
      sourceSentence: q.sourceSentence,
    }));
    const items = applyChanges(current, m.diff.changes as RubricChange[]);
    const v = await createVersion(role.id, items, "chat", m.diff.summary, c.user.id);
    await db.update(chatMessages).set({ diffState: "applied" }).where(eq(chatMessages.id, m.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "rubric.chat", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: v.version, detail: { diff: m.diff } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "rubric_changed", message: `Rubric v${v.version} from chat: ${m.diff.summary}`, actorId: c.user.id });
    after(() => pump(50_000));
    path(role.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function discardChatDiff(messageId: string): Promise<Result> {
  const c = await requireCtx();
  await db
    .update(chatMessages)
    .set({ diffState: "discarded" })
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, c.org.id), eq(chatMessages.diffState, "proposed")));
  revalidatePath("/console", "layout");
  return { ok: true };
}

