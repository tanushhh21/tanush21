import type { Metadata } from "next";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, applications, chatMessages, orgs, roles } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { USD_INR } from "@/lib/console/money";
import { Card, CardHead, Stat, tableClass, tdClass, thClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Billing" };

const PLAN = { pilot: "Pilot", growth: "Growth", enterprise: "Enterprise" } as const;

export default async function Billing() {
  const c = await requireCtx();
  if (!can.billing(c)) return <p className="text-[13.5px] text-slate">Only an admin sees billing.</p>;
  const org = (await db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) }))!;
  const since = new Date(Date.now() - 365 * 86_400_000);
  const month = sql<string>`to_char(date_trunc('month', ${applications.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`;
  const [apps, model, chats, openRoles] = await Promise.all([
    db.select({ m: month, n: sql<number>`count(*)::int` }).from(applications).where(and(eq(applications.orgId, c.org.id), gte(applications.createdAt, since))).groupBy(month),
    db
      .select({ m: sql<string>`to_char(date_trunc('month', ${activity.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`, usd: sql<number>`coalesce(sum(${activity.costUsd}),0)::float` })
      .from(activity)
      .where(and(eq(activity.orgId, c.org.id), gte(activity.createdAt, since)))
      .groupBy(sql`1`),
    db
      .select({ m: sql<string>`to_char(date_trunc('month', ${chatMessages.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`, usd: sql<number>`coalesce(sum(${chatMessages.costUsd}),0)::float` })
      .from(chatMessages)
      .where(and(eq(chatMessages.orgId, c.org.id), gte(chatMessages.createdAt, since)))
      .groupBy(sql`1`),
    db.select({ n: sql<number>`count(*)::int` }).from(roles).where(and(eq(roles.orgId, c.org.id), eq(roles.state, "open"))),
  ]);
  const months = [...new Set([...apps.map((a) => a.m), ...model.map((a) => a.m), ...chats.map((a) => a.m)])].sort().reverse();
  const usage = months.map((m) => ({
    m,
    apps: apps.find((a) => a.m === m)?.n ?? 0,
    inr: ((model.find((a) => a.m === m)?.usd ?? 0) + (chats.find((a) => a.m === m)?.usd ?? 0)) * USD_INR,
  }));
  const thisMonth = usage[0];
  return (
    <div className="grid gap-5">
      <Card>
        <CardHead title="Plan" />
        <div className="grid gap-5 px-4 py-4 sm:grid-cols-3 sm:px-5">
          <Stat label="Plan" value={PLAN[org.plan]} sub="Set with Winnow's team" />
          <Stat label="Open roles" value={openRoles[0]?.n ?? 0} />
          <Stat label="Applications this month" value={thisMonth?.apps ?? 0} sub={thisMonth ? `Model usage ₹${Math.round(thisMonth.inr).toLocaleString("en-IN")}` : undefined} />
        </div>
      </Card>
      <Card>
        <CardHead title="Usage by month" meta={`Model usage at ₹${USD_INR} to the dollar.`} />
        <div className="overflow-x-auto px-1 pb-2">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Month</th>
                <th className={`${thClass} text-right`}>Applications</th>
                <th className={`${thClass} text-right`}>Model usage</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr>
                  <td colSpan={3} className={`${tdClass} text-slate`}>
                    No usage yet.
                  </td>
                </tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.m}>
                    <td className={tdClass}>{new Date(`${u.m}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td>
                    <td className={`${tdClass} text-right font-mono tabular-nums`}>{u.apps.toLocaleString("en-IN")}</td>
                    <td className={`${tdClass} text-right font-mono tabular-nums`}>₹{Math.round(u.inr).toLocaleString("en-IN")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHead title="Invoices" />
        <p className="px-4 py-4 text-[13.5px] text-slate sm:px-5">Invoices are emailed to your admins each month and listed here once issued. None yet.</p>
      </Card>
    </div>
  );
}
