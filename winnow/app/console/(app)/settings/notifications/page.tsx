import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships, notificationPrefs, orgs, users } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { saveNotificationPrefs } from "@/lib/console/actions/settings";
import { TYPES, prefsFor } from "@/lib/console/notify";
import { Card, CardHead, buttonClass, smallFieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const [prefs, org] = await Promise.all([prefsFor(c.user.id, c.org.id), db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) })]);
  const slack = Boolean(org?.slackWebhook);
  // What reaches whom: everyone's choices, for admins.
  const team = can.manageTeam(c)
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, c.org.id))
    : [];
  const all = team.length ? await db.select().from(notificationPrefs).where(eq(notificationPrefs.orgId, c.org.id)) : [];
  const channels = (userId: string, type: string) => {
    const t = TYPES.find((x) => x.type === type)!;
    const s = all.find((p) => p.userId === userId && p.type === type);
    const on = { inApp: s?.inApp ?? t.inApp, email: s?.email ?? t.email, slack: s?.slack ?? t.slack };
    const list = [on.inApp ? "app" : "", on.email ? (s?.frequency === "daily" ? "daily email" : "email") : "", on.slack && slack ? "Slack" : ""].filter(Boolean);
    return list.length ? list.join(", ") : "off";
  };
  return (
    <div className="grid gap-5">
      <Saved code={saved} messages={{ saved: "Saved." }} />
      <Card>
        <CardHead title="What reaches you" meta="Things that need you are on by default. Every new application is off, on purpose: a tool that emails on every application trains people to ignore it." />
        <form action={saveNotificationPrefs} className="px-1 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="text-[12px] text-slate">
                  <th className="px-3 py-2 font-medium sm:px-4">When</th>
                  <th className="px-3 py-2 text-center font-medium">In the app</th>
                  <th className="px-3 py-2 text-center font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">How often</th>
                  <th className="px-3 py-2 text-center font-medium">Slack</th>
                </tr>
              </thead>
              <tbody>
                {prefs.map((p) => (
                  <tr key={p.type} className="border-t border-hairline">
                    <td className="px-3 py-2.5 sm:px-4">{p.label}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" name={`${p.type}:inApp`} defaultChecked={p.inApp} aria-label={`${p.label}: in the app`} className="size-4 accent-[#1b4dff]" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" name={`${p.type}:email`} defaultChecked={p.email} aria-label={`${p.label}: email`} className="size-4 accent-[#1b4dff]" />
                    </td>
                    <td className="px-3 py-2.5">
                      <select name={`${p.type}:frequency`} defaultValue={p.frequency} aria-label={`${p.label}: how often`} className={smallFieldClass}>
                        <option value="instant">Straight away</option>
                        <option value="daily">Daily digest</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" name={`${p.type}:slack`} defaultChecked={p.slack} disabled={!slack} aria-label={`${p.label}: Slack`} className="size-4 accent-[#1b4dff] disabled:opacity-40" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!slack ? <p className="px-3 pt-2 text-[12.5px] text-slate sm:px-4">Slack is off until an admin connects it in Integrations.</p> : null}
          <div className="px-3 pt-3 sm:px-4">
            <button type="submit" className={buttonClass("primary")}>
              Save
            </button>
          </div>
        </form>
      </Card>
      {team.length ? (
        <Card>
          <CardHead title="What reaches whom" meta="Everyone's choices, so nothing important goes nowhere." />
          <div className="overflow-x-auto px-1 pb-3">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-slate">
                  <th className="px-3 py-2 font-medium sm:px-4">Person</th>
                  {TYPES.filter((t) => t.type !== "new_application").map((t) => (
                    <th key={t.type} className="px-2 py-2 font-medium">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.id} className="border-t border-hairline">
                    <td className="px-3 py-2 sm:px-4">{u.name || u.email}</td>
                    {TYPES.filter((t) => t.type !== "new_application").map((t) => {
                      const v = channels(u.id, t.type);
                      return (
                        <td key={t.type} className={`px-2 py-2 ${v === "off" ? "text-slate" : ""}`}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
