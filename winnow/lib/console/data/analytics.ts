/**
 * Analytics, per role and across roles, over a date range. Everything is
 * computed from what actually happened (the audit log, applications,
 * interviews), and every comparison is against this company's own baseline.
 */
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, applications, auditLog, chatMessages, dismissals, evaluations, interviews, persons, reasonCodes, roleSources, roles } from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "@/lib/console/context";
import { USD_INR } from "@/lib/console/money";

const DAY = 86_400_000;
export type Range = { from: Date; to: Date; roleId: string | null };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);

export const STAGE_BUCKET = (stage: string | undefined) =>
  !stage || ["new", "screening"].includes(stage) ? "At screen" : ["shortlisted", "on_hold"].includes(stage) ? "After shortlist" : "After interview";

export async function loadAnalytics(c: Ctx, range: Range) {
  const roleRows = await db
    .select({ id: roles.id, title: roles.title, state: roles.state, closeReason: roles.closeReason, hiredId: roles.hiredApplicationId, createdAt: roles.createdAt, rubricVersion: roles.rubricVersion, openings: roles.openings })
    .from(roles)
    .where(and(eq(roles.orgId, c.org.id), visibleRoles(c)));
  const allRoleIds = roleRows.map((r) => r.id);
  const scopeRoles = range.roleId ? roleRows.filter((r) => r.id === range.roleId) : roleRows;
  const roleIds = scopeRoles.map((r) => r.id);
  const NONE = ["00000000-0000-0000-0000-000000000000"];
  const ids = roleIds.length ? roleIds : NONE;

  const apps = await db
    .select({
      id: applications.id,
      roleId: applications.roleId,
      personId: applications.personId,
      name: persons.name,
      source: applications.source,
      sourceId: applications.sourceId,
      createdAt: applications.createdAt,
      stage: applications.stage,
      decision: applications.decision,
      reason: applications.reasonCode,
      acceptedAt: applications.acceptedAt,
      joinedAt: applications.joinedAt,
      prot: applications.protectedAttrs,
      parse: applications.parseStatus,
    })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(inArray(applications.roleId, ids), gte(applications.createdAt, range.from), lte(applications.createdAt, range.to), sql`coalesce(${applications.reasonCode}, '') <> 'duplicate'`));
  const appIds = apps.map((a) => a.id);
  const aIds = appIds.length ? appIds : NONE;
  const versionOf = new Map(roleRows.map((r) => [r.id, r.rubricVersion]));

  const [evals, decisions, ivs, labels, sources] = await Promise.all([
    db.select({ applicationId: evaluations.applicationId, version: evaluations.rubricVersion, status: evaluations.status, score: evaluations.score, band: evaluations.band, rank: evaluations.rank, percentile: evaluations.percentile, costUsd: evaluations.costUsd }).from(evaluations).where(inArray(evaluations.applicationId, aIds)),
    db
      .select({ action: auditLog.action, applicationId: auditLog.applicationId, roleId: auditLog.roleId, detail: auditLog.detail, at: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, c.org.id), inArray(auditLog.roleId, allRoleIds.length ? allRoleIds : NONE), or(sql`${auditLog.action} like 'decision.%'`, sql`${auditLog.action} like 'stage.%'`, eq(auditLog.action, "role.close")))),
    db.select({ applicationId: interviews.applicationId, status: interviews.status }).from(interviews).where(inArray(interviews.applicationId, aIds)),
    db.select().from(reasonCodes).where(or(isNull(reasonCodes.orgId), eq(reasonCodes.orgId, c.org.id))),
    db.select().from(roleSources).where(inArray(roleSources.roleId, ids)),
  ]);
  const label = (code: string | null) => labels.find((l) => l.code === code && l.orgId === c.org.id)?.label ?? labels.find((l) => l.code === code)?.label ?? code ?? "No reason";
  const evalOf = new Map(evals.filter((e) => e.version === versionOf.get(apps.find((a) => a.id === e.applicationId)?.roleId ?? "")).map((e) => [e.applicationId, e]));
  const inScope = new Set(appIds);
  const scopeDecisions = decisions.filter((d) => d.applicationId && inScope.has(d.applicationId));
  const everShortlisted = new Set(scopeDecisions.filter((d) => d.action === "decision.shortlisted").map((d) => d.applicationId!));
  for (const a of apps) if (["shortlisted", "interviewing", "offer", "hired"].includes(a.stage)) everShortlisted.add(a.id);
  const interviewed = new Set(ivs.filter((i) => i.status !== "cancelled").map((i) => i.applicationId));
  for (const a of apps) if (["interviewing", "offer", "hired"].includes(a.stage)) interviewed.add(a.id);
  const offered = new Set(scopeDecisions.filter((d) => d.action === "stage.offer").map((d) => d.applicationId!));
  for (const a of apps) if (["offer", "hired"].includes(a.stage)) offered.add(a.id);
  const accepted = new Set(apps.filter((a) => a.stage === "hired" || a.acceptedAt).map((a) => a.id));
  const joined = new Set(apps.filter((a) => a.joinedAt).map((a) => a.id));
  const scored = new Set([...evalOf.values()].filter((e) => e.status === "done").map((e) => e.applicationId));

  // ---- Pipeline
  const pipeline = [
    { label: "Received", value: apps.length },
    { label: "Scored", value: scored.size },
    { label: "Shortlisted", value: everShortlisted.size },
    { label: "Interviewed", value: interviewed.size },
    { label: "Offered", value: offered.size },
    { label: "Accepted", value: accepted.size },
    { label: "Joined", value: joined.size },
  ];

  // ---- Time, against this company's own baseline (all its roles, all time)
  const firstAt = (roleId: string, action: string) => {
    const t = decisions.filter((d) => d.roleId === roleId && d.action === action).map((d) => d.at.getTime());
    return t.length ? Math.min(...t) : null;
  };
  const timing = roleRows.map((r) => {
    const start = r.createdAt.getTime();
    const sl = firstAt(r.id, "decision.shortlisted");
    const of = firstAt(r.id, "stage.offer");
    const cl = r.state === "closed" ? firstAt(r.id, "role.close") : null;
    return { id: r.id, toShortlist: sl ? (sl - start) / DAY : null, toOffer: of ? (of - start) / DAY : null, toClose: cl ? (cl - start) / DAY : null };
  });
  const metric = (k: "toShortlist" | "toOffer" | "toClose") => ({
    value: median(timing.filter((t) => roleIds.includes(t.id) && t[k] != null).map((t) => t[k]!)),
    baseline: median(timing.filter((t) => t[k] != null).map((t) => t[k]!)),
    n: timing.filter((t) => roleIds.includes(t.id) && t[k] != null).length,
  });
  const time = { toShortlist: metric("toShortlist"), toOffer: metric("toOffer"), toClose: metric("toClose") };

  // ---- Rejection reasons, by stage and by role
  const drops = scopeDecisions.filter((d) => d.action === "decision.dropped" && (d.detail as { reasonCode?: string }).reasonCode !== "duplicate");
  const byStage = new Map<string, Map<string, number>>();
  const byRole = new Map<string, Map<string, number>>();
  for (const d of drops) {
    const det = d.detail as { stage?: string; reasonCode?: string };
    const s = STAGE_BUCKET(det.stage);
    const r = label(det.reasonCode ?? null);
    const m = byStage.get(s) ?? new Map();
    m.set(r, (m.get(r) ?? 0) + 1);
    byStage.set(s, m);
    const title = roleRows.find((x) => x.id === d.roleId)?.title ?? "Role";
    const n = byRole.get(title) ?? new Map();
    n.set(r, (n.get(r) ?? 0) + 1);
    byRole.set(title, n);
  }
  const toList = (m: Map<string, number>) => [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const rejections = {
    total: drops.length,
    byStage: ["At screen", "After shortlist", "After interview"].map((s) => ({ stage: s, items: toList(byStage.get(s) ?? new Map()), total: [...(byStage.get(s)?.values() ?? [])].reduce((a, b) => a + b, 0) })),
    byRole: [...byRole.entries()].map(([role, m]) => ({ role, items: toList(m), total: [...m.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total),
    headline: (() => {
      const screen = byStage.get("At screen");
      if (!screen) return null;
      const total = [...screen.values()].reduce((a, b) => a + b, 0);
      const [top] = toList(screen);
      return total >= 5 && top ? `${Math.round((100 * top.value) / total)}% of your rejections at screen are "${top.label.toLowerCase()}".` : null;
    })(),
  };

  // ---- Source effectiveness, ranked by people who advanced, never by volume
  const srcLabel = (a: (typeof apps)[number]) => sources.find((s) => s.id === a.sourceId)?.label ?? a.source.replace(/_/g, " ");
  const srcMap = new Map<string, { label: string; produced: number; shortlisted: number; interviewed: number; hired: number; cost: number }>();
  for (const a of apps) {
    const l = srcLabel(a);
    const s = srcMap.get(l) ?? { label: l, produced: 0, shortlisted: 0, interviewed: 0, hired: 0, cost: 0 };
    s.produced++;
    if (everShortlisted.has(a.id)) s.shortlisted++;
    if (interviewed.has(a.id)) s.interviewed++;
    if (accepted.has(a.id)) s.hired++;
    srcMap.set(l, s);
  }
  for (const s of sources) {
    const row = srcMap.get(s.label) ?? { label: s.label, produced: 0, shortlisted: 0, interviewed: 0, hired: 0, cost: 0 };
    row.cost += s.costInr;
    srcMap.set(s.label, row);
  }
  const sourceRows = [...srcMap.values()]
    .map((s) => ({ ...s, perShortlist: s.shortlisted && s.cost ? Math.round(s.cost / s.shortlisted) : null, perHire: s.hired && s.cost ? Math.round(s.cost / s.hired) : null }))
    .sort((a, b) => b.shortlisted + b.interviewed + b.hired * 3 - (a.shortlisted + a.interviewed + a.hired * 3));

  // ---- Rubric accuracy
  const judged = scopeDecisions.filter((d) => d.action === "decision.shortlisted" || d.action === "decision.dropped");
  const overrides = judged.filter((d) => {
    const det = d.detail as { reasonCode?: string; evaluation?: { band?: string } | null };
    const band = det.evaluation?.band;
    return (d.action === "decision.shortlisted" && band === "below_bar") || (d.action === "decision.dropped" && band === "verified" && ["below_bar", "missing_must_have"].includes(det.reasonCode ?? ""));
  });
  const closedFilled = scopeRoles.filter((r) => r.state === "closed" && r.closeReason === "filled");
  const hires = closedFilled
    .map((r) => {
      const hire = apps.find((a) => a.id === r.hiredId) ?? apps.find((a) => a.roleId === r.id && accepted.has(a.id));
      const e = hire ? evalOf.get(hire.id) : undefined;
      const arrival = apps.filter((a) => a.roleId === r.id).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
      const pos = hire ? arrival.findIndex((a) => a.id === hire.id) : -1;
      return {
        role: r.title,
        hire: hire?.name ?? null,
        rank: e?.rank ?? null,
        percentile: e?.percentile ?? null,
        arrivalPercentile: pos >= 0 && arrival.length > 1 ? Math.round(100 - (100 * pos) / (arrival.length - 1)) : null,
        n: arrival.length,
      };
    })
    .filter((h) => h.hire);
  const lateRejects = scopeDecisions.filter((d) => {
    const det = d.detail as { stage?: string; reasonCode?: string };
    return d.action === "decision.dropped" && ["shortlisted", "interviewing", "offer", "on_hold"].includes(det.stage ?? "") && ["below_bar", "missing_must_have", "failed_verification"].includes(det.reasonCode ?? "");
  });
  const accuracy = {
    overrideRate: pct(overrides.length, judged.length),
    overrides: overrides.length,
    judged: judged.length,
    topHired: hires.filter((h) => h.rank === 1).length,
    hires: hires.length,
    lateRejects: lateRejects.length,
    lateRejectRate: pct(lateRejects.length, everShortlisted.size),
  };
  const blind = {
    rows: hires,
    topDecile: hires.filter((h) => (h.percentile ?? 0) >= 90).length,
    theirTopDecile: hires.filter((h) => (h.arrivalPercentile ?? 0) >= 90).length,
  };

  // ---- Cost: model work (activity and chat) plus what sources cost
  const [act] = await db.select({ usd: sql<number>`coalesce(sum(${activity.costUsd}),0)::float` }).from(activity).where(and(inArray(activity.roleId, ids), gte(activity.createdAt, range.from), lte(activity.createdAt, range.to)));
  const [chat] = await db.select({ usd: sql<number>`coalesce(sum(${chatMessages.costUsd}),0)::float` }).from(chatMessages).where(and(inArray(chatMessages.roleId, ids), gte(chatMessages.createdAt, range.from), lte(chatMessages.createdAt, range.to)));
  const modelInr = ((act?.usd ?? 0) + (chat?.usd ?? 0)) * USD_INR;
  const sourceInr = sources.reduce((n, s) => n + s.costInr, 0);
  const totalInr = modelInr + sourceInr;
  const cost = {
    modelInr,
    sourceInr,
    totalInr,
    perCandidate: apps.length ? totalInr / apps.length : null,
    perShortlist: everShortlisted.size ? totalInr / everShortlisted.size : null,
    perHire: accepted.size ? totalInr / accepted.size : null,
    perRole: roleIds.length ? totalInr / roleIds.length : null,
  };

  // ---- Fairness: pass-through by stage across attributes excluded from scoring
  const year = new Date().getFullYear();
  const groupOf = {
    Gender: (a: (typeof apps)[number]) => ({ female: "Women", male: "Men", non_binary: "Non-binary" })[a.prot?.gender ?? ""] ?? "Not stated",
    Age: (a: (typeof apps)[number]) => {
      const by = a.prot?.birthYear;
      if (!by) return "Not stated";
      const age = year - by;
      return age < 25 ? "Under 25" : age < 35 ? "25 to 34" : age < 45 ? "35 to 44" : "45 and over";
    },
  };
  const steps: [string, (a: (typeof apps)[number]) => boolean, (a: (typeof apps)[number]) => boolean][] = [
    ["Scored → shortlisted", (a) => scored.has(a.id), (a) => everShortlisted.has(a.id)],
    ["Shortlisted → interviewed", (a) => everShortlisted.has(a.id), (a) => interviewed.has(a.id)],
    ["Interviewed → offered", (a) => interviewed.has(a.id), (a) => offered.has(a.id)],
  ];
  const fairness = (Object.keys(groupOf) as (keyof typeof groupOf)[]).map((attr) => {
    const groups = [...new Set(apps.map(groupOf[attr]))].sort();
    return {
      attr,
      stated: apps.filter((a) => groupOf[attr](a) !== "Not stated").length,
      steps: steps.map(([step, base, pass]) => {
        const rows = groups.map((g) => {
          const pool = apps.filter((a) => groupOf[attr](a) === g && base(a));
          const n = pool.length;
          const k = pool.filter(pass).length;
          return { group: g, n, passed: k, rate: n ? k / n : null };
        });
        const comparable = rows.filter((r) => r.group !== "Not stated" && r.n >= 10 && r.rate != null);
        const best = Math.max(0, ...comparable.map((r) => r.rate!));
        return {
          step,
          rows: rows.map((r) => ({ ...r, ratio: best && r.rate != null && r.group !== "Not stated" && r.n >= 10 ? r.rate / best : null })),
          flagged: comparable.some((r) => best > 0 && r.rate! / best < 0.8),
          enough: comparable.length >= 2,
        };
      }),
    };
  });

  // ---- Dismissals: an item type everyone dismisses should not exist
  const dism = await db
    .select({ type: dismissals.itemType, reason: dismissals.reason, n: sql<number>`count(*)::int` })
    .from(dismissals)
    .where(and(eq(dismissals.orgId, c.org.id), gte(dismissals.createdAt, range.from), lte(dismissals.createdAt, range.to)))
    .groupBy(dismissals.itemType, dismissals.reason);

  return { roles: roleRows.map((r) => ({ id: r.id, title: r.title })), pipeline, time, rejections, sources: sourceRows, accuracy, blind, cost, fairness, dismissals: dism, received: apps.length };
}

export function parseRange(q: { from?: string; to?: string; days?: string; role?: string }): Range & { days: string } {
  const now = new Date();
  const days = q.days ?? (q.from ? "custom" : "90");
  let from = new Date(now.getTime() - 90 * DAY);
  let to = now;
  if (days === "all") from = new Date(0);
  else if (days === "custom") {
    if (q.from && !Number.isNaN(Date.parse(q.from))) from = new Date(`${q.from}T00:00:00+05:30`);
    if (q.to && !Number.isNaN(Date.parse(q.to))) to = new Date(`${q.to}T23:59:59+05:30`);
  } else if (Number(days) > 0) from = new Date(now.getTime() - Number(days) * DAY);
  return { from, to, roleId: q.role && /^[0-9a-f-]{36}$/.test(q.role) ? q.role : null, days };
}
