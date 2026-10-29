/**
 * Rubric versions. Every change (an edit, a chat diff, a restore) makes a new
 * version, keeps the old scores, and re-scores: weight and must-have changes
 * by arithmetic alone; changed or new requirements by re-reading.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, evaluations, persons, requirements, roles, rubricVersions, verdicts, type ReqOrigin } from "@/lib/db/schema";
import { arithmetic } from "./arith";
import { currentRequirements } from "./scoring";
import { enqueue } from "./jobs";

export type ReqInput = {
  key?: string | null;
  text: string;
  weight: number;
  mustHave: boolean;
  keywords: string[];
  minYears: number | null;
  recencySensitive: boolean;
  origin: ReqOrigin;
  sourceSentence: string | null;
};

const meaning = (q: { text: string; keywords: string[]; minYears: number | null; recencySensitive: boolean }) =>
  JSON.stringify([q.text.trim().toLowerCase(), [...q.keywords].sort(), q.minYears, q.recencySensitive]);

/** Creates version n+1 from these requirements and queues the re-score. */
export async function createVersion(roleId: string, items: ReqInput[], origin: "edit" | "chat" | "restore" | "fitted", summary: string, userId: string | null) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) throw new Error("Role not found.");
  const before = role.rubricVersion ? await currentRequirements(roleId, role.rubricVersion) : [];
  const next = role.rubricVersion + 1;
  const clean = items
    .map((q) => ({ ...q, text: q.text.trim().slice(0, 300), weight: Math.min(5, Math.max(1, Math.round(q.weight))), keywords: q.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 10) }))
    .filter((q) => q.text);
  if (clean.length === 0) throw new Error("A rubric needs at least one requirement.");

  const keyed = clean.map((q) => ({ ...q, key: q.key && before.some((b) => b.key === q.key) ? q.key : crypto.randomUUID().slice(0, 8) }));
  const changed = keyed.filter((q) => {
    const old = before.find((b) => b.key === q.key);
    return !old || meaning(old) !== meaning(q);
  });

  await db.transaction(async (tx) => {
    const [v] = await tx.insert(rubricVersions).values({ roleId, version: next, origin, summary: summary.slice(0, 300), createdBy: userId }).returning();
    await tx.insert(requirements).values(
      keyed.map((q, i) => ({
        rubricVersionId: v.id,
        key: q.key,
        position: i,
        text: q.text,
        weight: q.weight,
        mustHave: q.mustHave,
        sourceSentence: q.sourceSentence,
        origin: q.origin,
        keywords: q.keywords,
        minYears: q.minYears,
        recencySensitive: q.recencySensitive,
      })),
    );
    await tx.update(roles).set({ rubricVersion: next, rubricReviewedAt: new Date(), lastChangeAt: new Date() }).where(eq(roles.id, roleId));
  });
  if (role.rubricVersion > 0) await enqueue("rescore", { orgId: role.orgId, roleId, payload: { roleId, version: next, changed: changed.map((c) => c.key) } });
  return { version: next, changed: changed.length };
}

/**
 * What a set of requirements would do to the current ranking, by arithmetic on
 * the verdicts already known. New or reworded requirements cannot be known
 * until they are re-read; they are counted separately.
 */
export async function impactOf(roleId: string, items: (ReqInput & { key: string })[]) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role || role.rubricVersion === 0) return { moved: 0, enteredTop: [], leftTop: [], toReread: 0 };
  const before = await currentRequirements(roleId, role.rubricVersion);
  const rows = await db
    .select({ ev: evaluations, name: persons.name })
    .from(evaluations)
    .innerJoin(applications, eq(applications.id, evaluations.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(eq(evaluations.roleId, roleId), eq(evaluations.rubricVersion, role.rubricVersion), eq(evaluations.status, "done"), eq(evaluations.filteredOut, false)));
  const vs = rows.length ? await db.select().from(verdicts).where(inArray(verdicts.evaluationId, rows.map((r) => r.ev.id))) : [];
  const standing = (reqs: { key: string; weight: number; mustHave: boolean; text: string }[]) =>
    rows
      .map((r) => ({ id: r.ev.applicationId, name: r.name, s: arithmetic(reqs, vs.filter((v) => v.evaluationId === r.ev.id)).standing }))
      .sort((a, b) => b.s - a.s);
  const now = standing(before);
  const after = standing(items);
  const top = Math.max(10, role.openings * 5);
  const topNow = new Set(now.slice(0, top).map((x) => x.id));
  const topAfter = new Set(after.slice(0, top).map((x) => x.id));
  const moved = after.filter((x, i) => now.findIndex((y) => y.id === x.id) !== i).length;
  const newKeys = items.filter((q) => {
    const old = before.find((b) => b.key === q.key);
    return !old || meaning(old) !== meaning(q);
  });
  return {
    moved,
    enteredTop: after.filter((x) => topAfter.has(x.id) && !topNow.has(x.id)).map((x) => x.name),
    leftTop: now.filter((x) => topNow.has(x.id) && !topAfter.has(x.id)).map((x) => x.name),
    toReread: newKeys.length ? rows.length : 0,
  };
}

/** What each version did to the ranking: who entered and left the top. */
export async function versionEffects(roleId: string) {
  const versions = await db.select().from(rubricVersions).where(eq(rubricVersions.roleId, roleId)).orderBy(asc(rubricVersions.version));
  const top = 10;
  const tops = new Map<number, Map<string, string>>();
  for (const v of versions) {
    const rows = await db
      .select({ id: evaluations.applicationId, rank: evaluations.rank, name: persons.name })
      .from(evaluations)
      .innerJoin(applications, eq(applications.id, evaluations.applicationId))
      .innerJoin(persons, eq(persons.id, applications.personId))
      .where(and(eq(evaluations.roleId, roleId), eq(evaluations.rubricVersion, v.version)));
    tops.set(v.version, new Map(rows.filter((r) => r.rank != null && r.rank <= top).map((r) => [r.id, r.name])));
  }
  return versions.map((v) => {
    const now = tops.get(v.version) ?? new Map();
    const prev = tops.get(v.version - 1) ?? new Map();
    return {
      version: v.version,
      entered: [...now].filter(([id]) => !prev.has(id)).map(([, n]) => n),
      left: [...prev].filter(([id]) => !now.has(id)).map(([, n]) => n),
      ranked: now.size,
    };
  });
}

export type RubricChange = { op: string; key: string | null; text: string | null; weight: number | null; must_have: boolean | null; keywords: string[] };

/** Applies chat-style edits (set_weight, add, remove…) to a rubric, by requirement key. */
export function applyChanges(current: (ReqInput & { key: string })[], changes: RubricChange[]) {
  let items = current.map((q) => ({ ...q }));
  for (const ch of changes) {
    const i = items.findIndex((q) => q.key === ch.key);
    if (ch.op === "add" && ch.text) {
      items.push({ key: crypto.randomUUID().slice(0, 8), text: ch.text, weight: ch.weight ?? 3, mustHave: ch.must_have ?? false, keywords: ch.keywords, minYears: null, recencySensitive: false, origin: "chat", sourceSentence: "You told us in chat" });
      continue;
    }
    if (i < 0) continue;
    if (ch.op === "remove") items = items.filter((_, j) => j !== i);
    else if (ch.op === "set_weight" && ch.weight) items[i].weight = Math.min(5, Math.max(1, ch.weight));
    else if (ch.op === "set_must_have" && ch.must_have != null) items[i].mustHave = ch.must_have;
    else if (ch.op === "edit_text" && ch.text) items[i] = { ...items[i], text: ch.text, origin: "chat" };
    else if (ch.op === "add_keywords") items[i].keywords = [...new Set([...items[i].keywords, ...ch.keywords])];
  }
  return items;
}
