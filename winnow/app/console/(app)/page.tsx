import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { evaluations, interviews, roles as rolesTable } from "@/lib/db/schema";
import { can, requireCtx, visibleRoles } from "@/lib/console/context";
import { summarizeRoles, statusTone } from "@/lib/console/roles";
import { NEED_LABEL, needsYou } from "@/lib/console/needs";
import { awayFeed, awayWindow } from "@/lib/console/data/home";
import { ButtonLink, Empty, PageHeader } from "@/components/console/ui";
import NeedsList from "@/components/console/home/NeedsList";
import RolesTable, { type RoleRow } from "@/components/console/home/RolesTable";

export const metadata: Metadata = { title: "Home" };

const DAY = 86_400_000;

/**
 * Home answers three questions in order: how are we doing, what needs me,
 * and how is each role going. Asking anything else goes to Chat.
 */
export default async function Home() {
  const c = await requireCtx();
  const [roles, needs] = await Promise.all([summarizeRoles(c, { includeClosed: true }), needsYou(c)]);

  // First run: one thing on screen.
  if (roles.length === 0) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <Empty
          title={can.createRole(c) ? "Add your first role" : "No roles yet"}
          action={can.createRole(c) ? <ButtonLink href="/console/roles/new" tone="primary">Add a role</ButtonLink> : null}
        >
          {can.createRole(c)
            ? "Describe the role in your own words, or paste the job description. Winnow sets it up, decides what to screen on, and starts ranking."
            : "Roles you are part of will appear here."}
        </Empty>
      </div>
    );
  }

  const open = roles.filter((r) => r.state !== "closed");
  const since = await awayWindow(c);
  const now = Date.now();
  const [feed, [week]] = await Promise.all([
    awayFeed(c, since),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(interviews)
      .innerJoin(rolesTable, eq(rolesTable.id, interviews.roleId))
      .where(and(visibleRoles(c), eq(interviews.status, "scheduled"), gte(interviews.startAt, new Date(now)), lte(interviews.startAt, new Date(now + 7 * DAY)))),
  ]);
  // A role whose scoring failed is shown as failed with the reason, never as zero candidates.
  const failedIds = roles.filter((r) => r.failed).map((r) => r.id);
  const failures = failedIds.length
    ? await db
        .select({ roleId: evaluations.roleId, error: evaluations.error })
        .from(evaluations)
        .innerJoin(rolesTable, eq(rolesTable.id, evaluations.roleId))
        .where(and(inArray(evaluations.roleId, failedIds), eq(evaluations.status, "failed"), eq(evaluations.rubricVersion, rolesTable.rubricVersion)))
        .orderBy(desc(evaluations.createdAt))
    : [];
  const toReview = (r: (typeof roles)[number]) => (r.stages.new ?? 0) + (r.stages.screening ?? 0);
  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    title: r.title,
    manager: r.hiringManager,
    mine: r.hiringManagerId === c.user.id || r.createdBy === c.user.id,
    daysOpen: r.daysOpen,
    received: r.received,
    toReview: toReview(r),
    shortlisted: (r.stages.shortlisted ?? 0) + (r.stages.on_hold ?? 0),
    interviewing: r.stages.interviewing ?? 0,
    offer: (r.stages.offer ?? 0) + (r.stages.hired ?? 0),
    failed: r.failed,
    failReason: failures.find((f) => f.roleId === r.id)?.error ?? null,
    unreadable: r.unreadable,
    status: r.status,
    tone: statusTone(r.status),
    risk: r.risk,
  }));
  const stats = [
    { label: "Open roles", value: open.length, href: "#roles" },
    { label: "Candidates to review", value: open.reduce((n, r) => n + toReview(r), 0), href: "#roles" },
    { label: "Interviews this week", value: week?.n ?? 0, href: "#roles" },
    { label: "Offers out", value: open.reduce((n, r) => n + (r.stages.offer ?? 0), 0), href: "#roles" },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Good ${greeting()}, ${c.user.name.split(" ")[0]}`}
        meta={needs.length ? `${needs.length} thing${needs.length === 1 ? "" : "s"} need${needs.length === 1 ? "s" : ""} you today.` : "Nothing needs you right now."}
        actions={can.createRole(c) ? <ButtonLink href="/console/roles/new" tone="primary">New role</ButtonLink> : null}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[14px] border border-hairline bg-paper px-4 py-3.5">
            <dt className="text-[12.5px] text-slate">{s.label}</dt>
            <dd className="mt-1 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
          <section aria-labelledby="needs">
            <h2 id="needs" className="mb-3 font-display text-[17px] font-semibold">
              Needs you
            </h2>
            <NeedsList items={needs.map((n) => ({ key: n.key, type: n.type, label: NEED_LABEL[n.type], roleTitle: n.roleTitle, roleId: n.roleId, person: n.person, ageDays: n.ageDays, text: n.text, action: n.action }))} />
          </section>

          <section aria-labelledby="roles-title" id="roles" className="scroll-mt-20">
            <h2 id="roles-title" className="mb-3 font-display text-[17px] font-semibold">
              Your roles
            </h2>
            <RolesTable rows={rows} />
          </section>
        </div>

        <aside className="grid min-w-0 gap-6">
          <form action="/console/chat" method="get" className="rounded-[14px] border border-hairline bg-paper p-4">
            <label htmlFor="ask" className="font-display text-[15px] font-semibold">
              Ask Winnow
            </label>
            <p className="mt-0.5 text-[12.5px] text-slate">Ask anything, or tell it what to do: set up a role, shortlist, send questions.</p>
            <div className="mt-3 flex gap-2">
              <input id="ask" name="q" placeholder="e.g. Which role is stuck?" className="h-10 min-w-0 flex-1 rounded-[10px] border border-hairline bg-paper px-3 text-[16px] placeholder:text-slate/70 focus:border-signal focus:outline-none sm:text-[14px]" />
              <button type="submit" className="h-10 shrink-0 rounded-full bg-ink px-4 text-[13.5px] font-medium text-paper hover:bg-ink/85">
                Ask
              </button>
            </div>
          </form>

          <section aria-labelledby="away">
            <h2 id="away" className="font-display text-[15px] font-semibold">
              Recently
            </h2>
            <p className="mb-3 text-[12px] text-slate">Since {since.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
            {feed.length === 0 ? (
              <p className="text-[13.5px] text-slate">Nothing new since then.</p>
            ) : (
              <ol className="grid gap-3">
                {feed.slice(0, 12).map((f) => (
                  <li key={f.id} className="text-[13.5px] leading-snug">
                    <span className={f.failure ? "text-alert" : ""}>{f.text}</span>
                    <span className="block text-[12px] text-slate">
                      {f.roleId ? (
                        <Link href={`/console/roles/${f.roleId}/activity`} className="hover:text-ink hover:underline">
                          {f.roleTitle}
                        </Link>
                      ) : null}{" "}
                      · {f.at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
