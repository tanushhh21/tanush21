"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  calibrations,
  contradictions,
  evaluations,
  memberships,
  notes,
  observations,
  persons,
  reasonCodes,
  roles,
  savedViews,
  talentPoolMembers,
  talentPools,
  users,
  type Decision,
  type ViewConfig,
} from "@/lib/db/schema";
import { Forbidden, can, requireCtx, visibleRoles, type Ctx } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { touchRole } from "@/lib/console/roles";
import { notify } from "@/lib/console/notify";
import { loadCandidate } from "@/lib/console/data/candidate";
import { explainAgainst, challengeRank } from "@/lib/ai/tasks";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

/** Only applications in roles this person can see. */
async function visibleApps(c: Ctx, ids: string[]) {
  if (ids.length === 0 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return [];
  return db
    .select({ app: applications, role: roles })
    .from(applications)
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(inArray(applications.id, ids), visibleRoles(c)));
}

export async function fetchCandidate(applicationId: string) {
  const c = await requireCtx();
  const data = await loadCandidate(c, applicationId);
  if (!data) return null;
  // The hiring manager opening a candidate is what "looked at" means.
  if (data.role.hiringManagerId === c.user.id) {
    await db.update(applications).set({ managerSeenAt: new Date() }).where(and(eq(applications.id, applicationId), isNull(applications.managerSeenAt)));
  }
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "candidate.view", entity: "application", entityId: applicationId, roleId: data.role.id, applicationId });
  return data;
}

const STAGE: Record<Exclude<Decision, "none">, "shortlisted" | "dropped" | "on_hold"> = { shortlisted: "shortlisted", dropped: "dropped", held: "on_hold" };

/** Shortlist, drop or hold. A reason code is always required, and every decision is recorded. */
export async function decide(input: { ids: string[]; decision: Exclude<Decision, "none">; reasonCode: string; note?: string }): Promise<Result> {
  try {
    const c = await requireCtx();
    if (!can.decide(c)) throw new Forbidden();
    const rows = await visibleApps(c, input.ids);
    if (rows.length === 0) throw new Error("Nothing to decide on.");
    const code = await db.query.reasonCodes.findFirst({
      where: and(eq(reasonCodes.code, input.reasonCode), eq(reasonCodes.active, true), or(isNull(reasonCodes.orgId), eq(reasonCodes.orgId, c.org.id))),
    });
    if (!code) throw new Error("Choose a reason.");
    const now = new Date();
    for (const { app, role } of rows) {
      const ev = await db.query.evaluations.findFirst({ where: and(eq(evaluations.applicationId, app.id), eq(evaluations.rubricVersion, role.rubricVersion)) });
      await db
        .update(applications)
        .set({ decision: input.decision, stage: STAGE[input.decision], stageChangedAt: now, reasonCode: code.code, decisionNote: input.note?.slice(0, 1000) || null, decidedBy: c.user.id, decidedAt: now })
        .where(eq(applications.id, app.id));
      const snapshot = ev ? { score: ev.score, rank: ev.rank, band: ev.band, confidence: ev.confidence, reason: [ev.reasonStrength, ev.reasonGap] } : null;
      await db.insert(observations).values({
        orgId: c.org.id,
        kind: "decision",
        personId: app.personId,
        applicationId: app.id,
        roleId: role.id,
        payload: { decision: input.decision, reasonCode: code.code, note: input.note ?? null, rubricVersion: role.rubricVersion, evaluation: snapshot },
        createdBy: c.user.id,
      });
      await audit({
        orgId: c.org.id,
        actorId: c.user.id,
        action: `decision.${input.decision}`,
        entity: "application",
        entityId: app.id,
        roleId: role.id,
        applicationId: app.id,
        rubricVersion: role.rubricVersion,
        detail: { stage: app.stage, reasonCode: code.code, note: input.note ?? null, evaluation: snapshot },
      });
    }
    const role = rows[0].role;
    const verb = { shortlisted: "Shortlisted", dropped: "Dropped", held: "Held" }[input.decision];
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "decision", message: `${verb} ${rows.length} (${code.label})`, actorId: c.user.id, detail: { ids: input.ids } });
    await touchRole(role.id);
    if (input.decision === "shortlisted" && role.hiringManagerId && role.hiringManagerId !== c.user.id) {
      await notify(c.org.id, [role.hiringManagerId], "shortlist_ready", `${rows.length} shortlisted for ${role.title}`, `/console/roles/${role.id}?view=shortlisted`);
    }
    revalidatePath(`/console/roles/${role.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Clears a decision (back to undecided), recorded like any other. */
export async function undecide(id: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const [row] = await visibleApps(c, [id]);
    if (!row) throw new Error("Not found.");
    await db.update(applications).set({ decision: "none", stage: "screening", stageChangedAt: new Date(), reasonCode: null, decisionNote: null, decidedBy: null, decidedAt: null }).where(eq(applications.id, id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "decision.clear", entity: "application", entityId: id, roleId: row.role.id, applicationId: id, rubricVersion: row.role.rubricVersion });
    revalidatePath(`/console/roles/${row.role.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Free text, @mentions notify, visible to the team. */
export async function addNote(applicationId: string, body: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const [row] = await visibleApps(c, [applicationId]);
    if (!row || !body.trim()) throw new Error("Write a note first.");
    const team = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, c.org.id));
    const mentioned = team.filter((t) => {
      const handle = (t.name ?? t.email ?? "").split(" ")[0].toLowerCase();
      return handle && body.toLowerCase().includes(`@${handle}`);
    });
    await db.insert(notes).values({ applicationId, authorId: c.user.id, body: body.slice(0, 4000), mentions: mentioned.map((m) => m.id) });
    await db.insert(observations).values({ orgId: c.org.id, kind: "note", personId: row.app.personId, applicationId, roleId: row.role.id, payload: { body: body.slice(0, 4000) }, createdBy: c.user.id });
    const others = mentioned.map((m) => m.id).filter((id) => id !== c.user.id);
    if (others.length) await notify(c.org.id, others, "mention", `${c.user.name} mentioned you on a candidate for ${row.role.title}`, `/console/c/${applicationId}#notes`);
    revalidatePath(`/console/c/${applicationId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function readContradictions(applicationId: string): Promise<Result> {
  const c = await requireCtx();
  const [row] = await visibleApps(c, [applicationId]);
  if (!row) return { ok: false, error: "Not found." };
  await db.update(contradictions).set({ readAt: new Date() }).where(and(eq(contradictions.applicationId, applicationId), isNull(contradictions.readAt)));
  return { ok: true };
}

/** A human resolves a contradiction with a note. It never changed the score; resolving lets the band clear. */
export async function resolveContradiction(id: string, note: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const cx = await db.query.contradictions.findFirst({ where: eq(contradictions.id, id) });
    const [row] = cx ? await visibleApps(c, [cx.applicationId]) : [];
    if (!cx || !row) throw new Error("Not found.");
    if (!note.trim()) throw new Error("Add a note saying how it was resolved.");
    await db.update(contradictions).set({ resolvedAt: new Date(), resolvedBy: c.user.id, resolution: note.slice(0, 1000), readAt: cx.readAt ?? new Date() }).where(eq(contradictions.id, id));
    await db.insert(observations).values({ orgId: c.org.id, kind: "contradiction_resolution", personId: row.app.personId, applicationId: row.app.id, roleId: row.role.id, payload: { contradictionId: id, note }, createdBy: c.user.id });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "contradiction.resolve", entity: "contradiction", entityId: id, roleId: row.role.id, applicationId: row.app.id });
    const { rankRole } = await import("@/lib/console/scoring");
    await rankRole(row.role.id, row.role.rubricVersion);
    revalidatePath(`/console/c/${row.app.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveView(input: { roleId: string; scope: "ranking" | "candidates"; name: string; config: ViewConfig }): Promise<Result> {
  try {
    const c = await requireCtx();
    const [role] = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.id, input.roleId), visibleRoles(c)));
    if (!role || !input.name.trim()) throw new Error("Name the view.");
    await db.insert(savedViews).values({ orgId: c.org.id, roleId: role.id, scope: input.scope, userId: c.user.id, name: input.name.slice(0, 60), config: input.config });
    revalidatePath(`/console/roles/${role.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteView(id: string): Promise<Result> {
  const c = await requireCtx();
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.userId, c.user.id)));
  return { ok: true };
}

/** Adds people to a named talent pool (created if new). */
export async function addToPool(ids: string[], poolName: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const rows = await visibleApps(c, ids);
    const name = poolName.trim() || "Silver medallists";
    let pool = await db.query.talentPools.findFirst({ where: and(eq(talentPools.orgId, c.org.id), eq(talentPools.name, name)) });
    if (!pool) [pool] = await db.insert(talentPools).values({ orgId: c.org.id, name, createdBy: c.user.id }).returning();
    if (rows.length) await db.insert(talentPoolMembers).values(rows.map((r) => ({ poolId: pool.id, personId: r.app.personId, addedBy: c.user.id }))).onConflictDoNothing();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Compare: "which would you interview first?" The answer is a training signal for the weights. */
export async function calibrate(roleId: string, chosenId: string, otherIds: string[]): Promise<Result> {
  try {
    const c = await requireCtx();
    const rows = await visibleApps(c, [chosenId, ...otherIds]);
    if (rows.length < 2 || rows.some((r) => r.role.id !== roleId)) throw new Error("Pick candidates from the same role.");
    await db.insert(calibrations).values(otherIds.map((o) => ({ roleId, chosenId, otherId: o, userId: c.user.id })));
    const chosen = rows.find((r) => r.app.id === chosenId)!;
    await db.insert(observations).values({ orgId: c.org.id, kind: "calibration", personId: chosen.app.personId, applicationId: chosenId, roleId, payload: { over: otherIds }, createdBy: c.user.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Deeper, on demand: each costs a model call and is one click. */
export async function deeper(kind: "explain" | "challenge", applicationId: string, neighbourId?: string): Promise<{ ok: true; text: string; costUsd: number } | { ok: false; error: string }> {
  try {
    const c = await requireCtx();
    const me = await loadCandidate(c, applicationId);
    if (!me) throw new Error("Not found.");
    const brief = (x: NonNullable<typeof me>) =>
      `Rank ${x.header.rank ?? "–"}, score ${x.header.score ?? "–"}.\n${x.rubric.map((r) => `- ${r.text} (weight ${r.weight}${r.mustHave ? ", must-have" : ""}): ${r.verdict}${r.quote ? ` — "${r.quote}"` : ""}`).join("\n")}`;
    let out;
    if (kind === "explain") {
      const other = neighbourId ? await loadCandidate(c, neighbourId) : null;
      if (!other) throw new Error("Pick someone to compare with.");
      out = await explainAgainst(me.role.title, "Candidate A", brief(me), "Candidate B", brief(other));
    } else {
      out = await challengeRank(me.role.title, brief(me), me.cvText ?? "");
    }
    await logActivity({ orgId: c.org.id, roleId: me.role.id, kind: kind === "explain" ? "explained" : "challenged", message: kind === "explain" ? "Explained a ranking against a neighbour" : "Argued a candidate was ranked wrongly", costUsd: out.costUsd, actorId: c.user.id });
    return { ok: true, text: out.data.text, costUsd: out.costUsd };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function setInterest(applicationId: string, interest: "interested" | "not_interested" | "unknown"): Promise<Result> {
  const c = await requireCtx();
  const [row] = await visibleApps(c, [applicationId]);
  if (!row) return { ok: false, error: "Not found." };
  await db.update(applications).set({ interest }).where(eq(applications.id, applicationId));
  await db.insert(observations).values({ orgId: c.org.id, kind: "interest", personId: row.app.personId, applicationId, roleId: row.role.id, payload: { interest }, createdBy: c.user.id });
  return { ok: true };
}

export async function updatePerson(personId: string, patch: { consent?: "unknown" | "given" | "withdrawn" }): Promise<Result> {
  const c = await requireCtx();
  const p = await db.query.persons.findFirst({ where: and(eq(persons.id, personId), eq(persons.orgId, c.org.id)) });
  if (!p) return { ok: false, error: "Not found." };
  if (patch.consent) await db.update(persons).set({ consent: patch.consent, consentAt: new Date() }).where(eq(persons.id, personId));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "person.update", entity: "person", entityId: personId, detail: patch });
  return { ok: true };
}
