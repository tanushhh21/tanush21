/**
 * What org chat can read: a compact snapshot of every role the person can
 * see, rejection reasons, sources, and anyone the question names. Built per
 * question so it never reaches beyond the asker's own access.
 */
import { and, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, persons, reasonCodes, roles } from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "@/lib/console/context";
import { summarizeRoles } from "@/lib/console/roles";

export async function orgChatContext(c: Ctx, question: string) {
  const summaries = await summarizeRoles(c, { includeClosed: true });
  const ids = summaries.map((r) => r.id);
  const lines: string[] = [`Company: ${c.org.name}. Today: ${new Date().toISOString().slice(0, 10)}.`];

  lines.push("## Roles");
  for (const r of summaries)
    lines.push(
      `- ${r.title} | status: ${r.status} | open ${r.daysOpen} days | last change ${r.daysSinceChange} days ago | manager: ${r.hiringManager ?? "not set"} | received ${r.received}, scored ${r.scored}, shortlisted ${r.shortlisted}, unreadable ${r.unreadable} | stages: ${Object.entries(r.stages).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    );

  if (ids.length) {
    const labels = new Map((await db.select().from(reasonCodes).where(or(eq(reasonCodes.orgId, c.org.id), sql`${reasonCodes.orgId} is null`))).map((r) => [r.code, r.label]));
    const since = new Date(Date.now() - 90 * 86_400_000);
    const dropped = await db
      .select({ name: persons.name, role: roles.title, code: applications.reasonCode, at: applications.decidedAt })
      .from(applications)
      .innerJoin(persons, eq(persons.id, applications.personId))
      .innerJoin(roles, eq(roles.id, applications.roleId))
      .where(and(inArray(applications.roleId, ids), eq(applications.decision, "dropped"), gt(applications.decidedAt, since)))
      .orderBy(desc(applications.decidedAt))
      .limit(300);
    const counts = new Map<string, number>();
    for (const d of dropped) counts.set(d.code ?? "none", (counts.get(d.code ?? "none") ?? 0) + 1);
    lines.push("## Rejection reasons, last 90 days");
    lines.push(
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${labels.get(k) ?? k}: ${n}`)
        .join("; ") || "None.",
    );
    lines.push(...dropped.slice(0, 60).map((d) => `- ${d.name}, ${d.role}, ${labels.get(d.code ?? "") ?? d.code ?? "no reason"}, ${d.at?.toISOString().slice(0, 10)}`));

    const src = await db
      .select({
        source: applications.source,
        n: sql<number>`count(*)::int`,
        shortlisted: sql<number>`count(*) filter (where ${applications.decision} = 'shortlisted' or ${applications.stage} in ('interviewing','offer','hired'))::int`,
        hired: sql<number>`count(*) filter (where ${applications.stage} = 'hired')::int`,
      })
      .from(applications)
      .where(inArray(applications.roleId, ids))
      .groupBy(applications.source);
    lines.push("## Sources");
    lines.push(...src.map((s) => `- ${s.source}: ${s.n} candidates, ${s.shortlisted} shortlisted or further, ${s.hired} hired`));
  }

  // Names or emails in the question: look them up in the person graph.
  const emails = question.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  const names = (question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+/g) ?? []).filter((n) => !/^(Have|Has|Did|Who|Which|What|Is|Was)\b/.test(n));
  if ((emails.length || names.length) && ids.length) {
    const found = await db
      .select({ id: persons.id, name: persons.name, email: persons.email })
      .from(persons)
      .where(and(eq(persons.orgId, c.org.id), sql`${persons.mergedInto} is null`, or(...emails.map((e) => eq(persons.email, e.toLowerCase())), ...names.map((n) => ilike(persons.name, `%${n}%`)))))
      .limit(10);
    lines.push("## People matching the question");
    if (!found.length) lines.push("Nobody by that name or email.");
    for (const p of found) {
      const apps = await db
        .select({ role: roles.title, stage: applications.stage, decision: applications.decision, code: applications.reasonCode, at: applications.createdAt })
        .from(applications)
        .innerJoin(roles, eq(roles.id, applications.roleId))
        .where(and(eq(applications.personId, p.id), visibleRoles(c)));
      lines.push(`- ${p.name}${p.email ? ` <${p.email}>` : ""}: ${apps.length ? apps.map((a) => `${a.role} (applied ${a.at.toISOString().slice(0, 10)}, ${a.stage}, ${a.decision}${a.code ? `, ${a.code}` : ""})`).join("; ") : "no applications you can see"}`);
    }
  }
  return lines.join("\n");
}
