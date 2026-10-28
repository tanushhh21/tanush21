"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationFacts, applications, documents, persons, roleSources, roles, talentPoolMembers, talentPools } from "@/lib/db/schema";
import { assertCan, can, requireCtx, requireRole, visibleRoles, type Ctx } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { enqueueMany, pump } from "@/lib/console/jobs";
import { touchRole } from "@/lib/console/roles";

const NONE = ["00000000-0000-0000-0000-000000000000"];
type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

/** People the viewer can see: they applied to at least one role the viewer can see. */
async function visiblePeople(c: Ctx, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .selectDistinct({ id: persons.id })
    .from(persons)
    .innerJoin(applications, eq(applications.personId, persons.id))
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(eq(persons.orgId, c.org.id), inArray(persons.id, ids.slice(0, 2000)), visibleRoles(c)));
  return rows.map((r) => r.id);
}

/**
 * Scores people from the pool against an open role in one action: each gets
 * an application on that role carrying their latest readable CV, and is
 * scored against the current rubric. Withdrawn consent is respected.
 */
export async function rerankAgainst(roleId: string, personIds: string[]): Promise<Result> {
  try {
    const c = await requireCtx();
    assertCan(c, can.manageSources);
    const role = await requireRole(c, roleId);
    if (role.state !== "open") throw new Error("Pick an open role.");
    if (role.rubricVersion === 0) throw new Error("That role has no rubric yet.");
    const ids = await visiblePeople(c, personIds);
    const people = await db.select().from(persons).where(inArray(persons.id, ids.length ? ids : NONE));
    const already = new Set(
      (await db.select({ personId: applications.personId }).from(applications).where(and(eq(applications.roleId, role.id), inArray(applications.personId, ids.length ? ids : NONE)))).map((a) => a.personId),
    );
    let [source] = await db.select().from(roleSources).where(and(eq(roleSources.roleId, role.id), eq(roleSources.kind, "talent_pool")));
    if (!source) [source] = await db.insert(roleSources).values({ roleId: role.id, kind: "talent_pool", label: "Talent pool" }).returning();
    const skipped = { consent: 0, applied: 0, noCv: 0 };
    const jobs: { orgId: string; roleId: string; payload: Record<string, unknown> }[] = [];
    for (const p of people) {
      if (p.consent === "withdrawn") {
        skipped.consent++;
        continue;
      }
      if (already.has(p.id)) {
        skipped.applied++;
        continue;
      }
      const doc = await db.query.documents.findFirst({
        where: and(eq(documents.personId, p.id), eq(documents.kind, "cv"), eq(documents.parseStatus, "parsed"), sql`${documents.text} is not null`),
        orderBy: [desc(documents.createdAt)],
      });
      if (!doc) {
        skipped.noCv++;
        continue;
      }
      const [app] = await db
        .insert(applications)
        .values({ orgId: c.org.id, roleId: role.id, personId: p.id, source: "talent_pool", sourceId: source.id, parseStatus: "parsed", stage: "new" })
        .returning();
      await db.insert(documents).values({ orgId: c.org.id, personId: p.id, applicationId: app.id, roleId: role.id, kind: "cv", filename: doc.filename, mime: doc.mime, size: doc.size, url: doc.url, text: doc.text, parseStatus: "parsed", excluded: doc.excluded });
      if (doc.applicationId) {
        const facts = await db.select().from(applicationFacts).where(eq(applicationFacts.applicationId, doc.applicationId));
        if (facts.length) await db.insert(applicationFacts).values(facts.map(({ id: _id, applicationId: _a, documentId: _d, ...f }) => ({ ...f, applicationId: app.id })));
      }
      jobs.push({ orgId: c.org.id, roleId: role.id, payload: { applicationId: app.id, version: role.rubricVersion } });
    }
    await enqueueMany("score", jobs);
    after(() => pump(50_000));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "talent.rerank", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: role.rubricVersion, detail: { added: jobs.length, ...skipped } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "talent_rerank", message: `Scoring ${jobs.length} from the talent pool against this role`, actorId: c.user.id });
    await touchRole(role.id);
    const notes = [
      skipped.applied ? `${skipped.applied} already on this role` : "",
      skipped.consent ? `${skipped.consent} withdrew consent` : "",
      skipped.noCv ? `${skipped.noCv} with no readable CV` : "",
    ].filter(Boolean);
    return { ok: true, message: `Scoring ${jobs.length} against ${role.title}${notes.length ? ` (skipped: ${notes.join(", ")})` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function tagPeople(personIds: string[], tag: string, remove = false): Promise<Result> {
  try {
    const c = await requireCtx();
    const t = tag.trim().toLowerCase().slice(0, 40);
    if (!t) throw new Error("Type a tag.");
    const ids = await visiblePeople(c, personIds);
    if (ids.length)
      await db
        .update(persons)
        .set({ tags: remove ? sql`array_remove(${persons.tags}, ${t})` : sql`(select array_agg(distinct x) from unnest(array_append(${persons.tags}, ${t})) x)` })
        .where(inArray(persons.id, ids));
    revalidatePath("/console/talent");
    return { ok: true, message: remove ? `Removed "${t}"` : `Tagged ${ids.length} "${t}"` };
  } catch (e) {
    return fail(e);
  }
}

export async function poolPeople(personIds: string[], poolName: string, remove = false): Promise<Result> {
  try {
    const c = await requireCtx();
    const name = poolName.trim().slice(0, 80);
    if (!name) throw new Error("Name the pool.");
    const ids = await visiblePeople(c, personIds);
    let pool = await db.query.talentPools.findFirst({ where: and(eq(talentPools.orgId, c.org.id), eq(talentPools.name, name)) });
    if (!pool && remove) return { ok: true };
    if (!pool) [pool] = await db.insert(talentPools).values({ orgId: c.org.id, name, createdBy: c.user.id }).returning();
    if (remove) await db.delete(talentPoolMembers).where(and(eq(talentPoolMembers.poolId, pool.id), inArray(talentPoolMembers.personId, ids.length ? ids : NONE)));
    else if (ids.length) await db.insert(talentPoolMembers).values(ids.map((personId) => ({ poolId: pool.id, personId, addedBy: c.user.id }))).onConflictDoNothing();
    revalidatePath("/console/talent");
    return { ok: true, message: remove ? `Removed from ${name}` : `Added ${ids.length} to ${name}` };
  } catch (e) {
    return fail(e);
  }
}

/** Consent and retention, per person. Withdrawing consent stops all contact and re-ranking. */
export async function setConsent(personId: string, consent: "unknown" | "given" | "withdrawn", retainUntil?: string | null): Promise<Result> {
  try {
    const c = await requireCtx();
    const [id] = await visiblePeople(c, [personId]);
    if (!id) throw new Error("Not found.");
    await db
      .update(persons)
      .set({ consent, consentAt: new Date(), ...(retainUntil !== undefined ? { retainUntil: retainUntil || null } : {}) })
      .where(eq(persons.id, id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "person.consent", entity: "person", entityId: id, detail: { consent, retainUntil } });
    revalidatePath("/console/talent");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}
