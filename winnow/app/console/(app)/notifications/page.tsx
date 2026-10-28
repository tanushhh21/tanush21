import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireCtx } from "@/lib/console/context";
import { markAllRead, openNotification } from "@/lib/console/actions/notifications";
import { Empty, PageHeader, ago, buttonClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications() {
  const c = await requireCtx();
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, c.user.id), eq(notifications.orgId, c.org.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(200);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div className="grid max-w-[46rem] gap-5">
      <PageHeader
        title="Notifications"
        meta={unread ? `${unread} unread` : "All read"}
        actions={
          <>
            {unread ? (
              <form action={markAllRead}>
                <button type="submit" className={buttonClass("secondary", "sm")}>
                  Mark all read
                </button>
              </form>
            ) : null}
            <Link href="/console/settings/notifications" className={buttonClass("ghost", "sm")}>
              Choose what reaches you
            </Link>
          </>
        }
      />
      {rows.length === 0 ? (
        <Empty title="Nothing yet">When a shortlist is ready, a candidate replies or a role stalls, it shows here.</Empty>
      ) : (
        <ol className="divide-y divide-hairline overflow-hidden rounded-[14px] border border-hairline">
          {rows.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-mist/60">
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-signal"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] ${n.readAt ? "text-slate" : "font-medium text-ink"}`}>{n.title}</span>
                    <span className="text-[12px] text-slate">{ago(n.createdAt)}</span>
                  </span>
                  {!n.readAt ? <span className="sr-only">Unread</span> : null}
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
