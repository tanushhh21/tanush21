/**
 * The operator console's reads: across every customer, organised by the
 * action waiting, never by role.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, auditLog, booleanSearches, documents, evaluations, mergeCandidates, observations, orgs, outreach, persons, roles, searchResults } from "@/lib/db/schema";
import { currentRequirements } from "@/lib/console/scoring";

const DAY = 86_400_000;

export async function queueCounts() {
  const [r] = await db.execute(sql`
    select
      (select count(*)::int from boolean_search where status = 'to_run') as searches,
      (select count(*)::int from search_result r join boolean_search s on s.id = r.search_id where r.above_cut and not r.opened) as triage,
      (select count(*)::int from outreach where status = 'drafted') as outreach,
      (select count(*)::int from outreach where status = 'replied') as replies,
      (select count(*)::int from application a join role ro on ro.id = a.role_id where a.parse_status = 'unreadable' and ro.state = 'open' and coalesce(a.reason_code, '') <> 'unfixable') as parse,
      (select count(*)::int from merge_candidate where status = 'open') as merges`).then((x) => ((x as { rows?: unknown[] }).rows ?? (x as unknown as unknown[])) as Record<string, number>[]);
  return r;
}

const targetUrl = (target: string, q: string) => {
  const e = encodeURIComponent(q);
  if (target === "GitHub") return `https://github.com/search?q=${e}&type=users`;
  if (target === "Google X-ray") return `https://www.google.com/search?q=${e}`;
  if (target === "LinkedIn Recruiter") return `https://www.linkedin.com/search/results/people/?keywords=${e}`;
  return null;
};

export async function searchesToRun() {
  const rows = await db
    .select({ s: booleanSearches, role: roles.title, org: orgs.name, results: sql<number>`(select count(*)::int from ${searchResults} where ${searchResults.searchId} = ${booleanSearches.id})` })
    .from(booleanSearches)
    .innerJoin(roles, eq(roles.id, booleanSearches.roleId))
    .innerJoin(orgs, eq(orgs.id, booleanSearches.orgId))
    .where(and(inArray(booleanSearches.status, ["to_run", "run"]), eq(roles.state, "open")))
    .orderBy(booleanSearches.status, booleanSearches.createdAt)
    .limit(300);
  return rows.map((r) => ({ ...r.s, role: r.role, org: r.org, results: r.results, url: targetUrl(r.s.target, r.s.query) }));
}

/**
 * The ranker for search results: how much of the rubric a result's headline
 * and snippet speak to, must-haves counting double.
 */
export async function rankerFor(roleId: string) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  const reqs = role && role.rubricVersion ? await currentRequirements(roleId, role.rubricVersion) : [];
  const terms = reqs.map((q) => ({ w: q.weight * (q.mustHave ? 2 : 1), words: [...q.keywords, ...q.text.split(/\W+/).filter((w) => w.length > 4)].map((w) => w.toLowerCase()).filter(Boolean) }));
  const total = terms.reduce((n, t) => n + t.w, 0) || 1;
  return (text: string) => {
    const t = text.toLowerCase();
    return Math.round((100 * terms.reduce((n, q) => n + (q.words.some((w) => t.includes(w)) ? q.w : 0), 0)) / total) / 100;
  };
}

/** The recommended cut: learned from where operators moved it for this role, else 0.5. */
export async function learnedCut(roleId: string) {
  const rows = await db
    .select({ payload: observations.payload })
    .from(observations)
    .where(and(eq(observations.kind, "cut_line"), eq(observations.roleId, roleId)))
    .orderBy(desc(observations.createdAt))
    .limit(20);
  const xs = rows.map((r) => Number((r.payload as { threshold?: number }).threshold)).filter((n) => Number.isFinite(n));
  return xs.length ? Math.round((100 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 100 : 0.5;
}

export async function triage() {
  const rows = await db
    .select({ r: searchResults, query: booleanSearches.query, target: booleanSearches.target, searchId: booleanSearches.id, roleId: roles.id, role: roles.title, org: orgs.name })
    .from(searchResults)
    .innerJoin(booleanSearches, eq(booleanSearches.id, searchResults.searchId))
    .innerJoin(roles, eq(roles.id, booleanSearches.roleId))
    .innerJoin(orgs, eq(orgs.id, booleanSearches.orgId))
    .where(and(eq(roles.state, "open"), sql`not exists (select 1 from ${outreach} where ${outreach.resultId} = ${searchResults.id})`))
    .orderBy(desc(searchResults.score))
    .limit(600);
  const bySearch = new Map<string, { searchId: string; query: string; target: string; role: string; roleId: string; org: string; results: (typeof rows)[number]["r"][] }>();
  for (const x of rows) {
    const g = bySearch.get(x.searchId) ?? { searchId: x.searchId, query: x.query, target: x.target, role: x.role, roleId: x.roleId, org: x.org, results: [] };
    g.results.push(x.r);
    bySearch.set(x.searchId, g);
  }
  return [...bySearch.values()];
}

export async function outreachQueue(status: "drafted" | "replied") {
  return db
    .select({ o: outreach, role: roles.title, org: orgs.name, url: searchResults.url, headline: searchResults.headline })
    .from(outreach)
    .innerJoin(roles, eq(roles.id, outreach.roleId))
    .innerJoin(orgs, eq(orgs.id, outreach.orgId))
    .leftJoin(searchResults, eq(searchResults.id, outreach.resultId))
    .where(eq(outreach.status, status))
    .orderBy(outreach.createdAt)
    .limit(300);
}

export async function sentOutreach() {
  return db
    .select({ o: outreach, role: roles.title, org: orgs.name })
    .from(outreach)
    .innerJoin(roles, eq(roles.id, outreach.roleId))
    .innerJoin(orgs, eq(orgs.id, outreach.orgId))
    .where(eq(outreach.status, "sent"))
    .orderBy(desc(outreach.sentAt))
    .limit(200);
}

export async function parseFailures() {
  return db
    .select({ app: applications, role: roles.title, org: orgs.name, filename: documents.filename, docError: documents.parseError })
    .from(applications)
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .innerJoin(orgs, eq(orgs.id, applications.orgId))
    .leftJoin(documents, and(eq(documents.applicationId, applications.id), eq(documents.kind, "cv")))
    .where(and(eq(applications.parseStatus, "unreadable"), eq(roles.state, "open"), sql`coalesce(${applications.reasonCode}, '') <> 'unfixable'`))
    .orderBy(applications.createdAt)
    .limit(300);
}

export async function mergesToReview() {
  const rows = await db.select({ m: mergeCandidates, org: orgs.name }).from(mergeCandidates).innerJoin(orgs, eq(orgs.id, mergeCandidates.orgId)).where(eq(mergeCandidates.status, "open")).orderBy(mergeCandidates.confidence).limit(200);
  const ids = [...new Set(rows.flatMap((r) => [r.m.personA, r.m.personB]))];
  const people = ids.length ? await db.select().from(persons).where(inArray(persons.id, ids)) : [];
  const apps = ids.length
    ? await db.select({ personId: applications.personId, role: roles.title, at: applications.createdAt, stage: applications.stage }).from(applications).innerJoin(roles, eq(roles.id, applications.roleId)).where(inArray(applications.personId, ids))
    : [];
  const card = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? { id, name: p.name, email: p.email, phone: p.phone, city: p.city, links: p.links, apps: apps.filter((a) => a.personId === id).map((a) => `${a.role} (${a.stage}, ${a.at.toISOString().slice(0, 10)})`) } : null;
  };
  return rows.map((r) => ({ id: r.m.id, org: r.org, confidence: r.m.confidence, reason: r.m.reason, a: card(r.m.personA), b: card(r.m.personB) })).filter((r) => r.a && r.b);
}

/** Per customer: is anything late, and is any role at risk. */
export async function slaView() {
  const list = await db.select({ id: orgs.id, name: orgs.name, plan: orgs.plan }).from(orgs).orderBy(orgs.name);
  const out = [];
  for (const o of list) {
    const rs = await db.select().from(roles).where(and(eq(roles.orgId, o.id), eq(roles.state, "open")));
    const ids = rs.map((r) => r.id);
    const firstShortlist = ids.length
      ? await db.select({ roleId: auditLog.roleId, at: sql<Date>`min(${auditLog.createdAt})` }).from(auditLog).where(and(inArray(auditLog.roleId, ids), eq(auditLog.action, "decision.shortlisted"))).groupBy(auditLog.roleId)
      : [];
    const noShortlist = rs.filter((r) => !firstShortlist.some((f) => f.roleId === r.id) && Date.now() - r.createdAt.getTime() > 5 * DAY);
    const stalled = rs.filter((r) => Date.now() - r.lastChangeAt.getTime() > 7 * DAY);
    const late = rs.filter((r) => r.targetDate && new Date(r.targetDate).getTime() < Date.now());
    const [counts] = ids.length
      ? await db
          .select({
            unreadable: sql<number>`count(*) filter (where ${applications.parseStatus} = 'unreadable')::int`,
            pending: sql<number>`count(*) filter (where ${applications.parseStatus} = 'pending')::int`,
          })
          .from(applications)
          .where(inArray(applications.roleId, ids))
      : [{ unreadable: 0, pending: 0 }];
    const [failed] = ids.length ? await db.select({ n: sql<number>`count(*)::int` }).from(evaluations).where(and(inArray(evaluations.roleId, ids), eq(evaluations.status, "failed"))) : [{ n: 0 }];
    const risk = late.length || noShortlist.length > 1 || failed.n > 0 ? "high" : stalled.length || noShortlist.length || counts.unreadable ? "medium" : "low";
    out.push({ ...o, open: rs.length, noShortlist: noShortlist.map((r) => r.title), stalled: stalled.map((r) => r.title), late: late.map((r) => r.title), unreadable: counts.unreadable, pending: counts.pending, failed: failed.n, risk });
  }
  return out;
}

/** The number that decides whether this is a company or a job. */
export async function rolesPerOperator() {
  const rows = await db.execute(sql`
    select u.id, coalesce(u.name, u.email) as name, to_char(date_trunc('month', a.created_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as month, count(distinct a.role_id)::int as roles
    from activity a join "user" u on u.id = a.actor_id
    where u.is_operator and a.role_id is not null and a.created_at > now() - interval '12 months'
    group by 1, 2, 3 order by 3 desc, 4 desc`);
  return ((rows as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as { id: string; name: string; month: string; roles: number }[];
}

