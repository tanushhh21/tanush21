import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { summarizeRoles, statusTone } from "@/lib/console/roles";
import { needsYou } from "@/lib/console/needs";
import { signOutAction } from "@/lib/console/actions/session";
import SideNav from "@/components/console/SideNav";

const LEVEL = { hiring_manager: "Hiring manager", ta: "Talent acquisition", admin: "Admin", operator: "Winnow operator" } as const;

/** The signed-in console: sidebar (a menu on phones) and the page. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const c = await requireCtx();
  const [roleList, needs, unread] = await Promise.all([
    summarizeRoles(c),
    needsYou(c),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, c.user.id), eq(notifications.orgId, c.org.id), isNull(notifications.readAt)))
      .then((r) => r[0]?.n ?? 0),
  ]);
  return (
    <>
      <SideNav
        org={{ id: c.org.id, name: c.org.name }}
        orgCount={c.orgs.length}
        level={LEVEL[c.level]}
        user={{ name: c.user.name, email: c.user.email }}
        roles={roleList.map((r) => ({ id: r.id, title: r.title, status: r.status, tone: statusTone(r.status) }))}
        needsYou={needs.length}
        unread={unread}
        canCreateRole={can.createRole(c)}
        isOperator={c.user.isOperator}
        isAdmin={can.orgSettings(c)}
        signOut={signOutAction}
      />
      <div className="lg:pl-[248px]">
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
    </>
  );
}
