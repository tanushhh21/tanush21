import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { evaluations, interviews, roles as rolesTable } from "@/lib/db/schema";
import { can, requireCtx, visibleRoles } from "@/lib/console/context";
import { summarizeRoles, statusTone } from "@/lib/console/roles";
import { NEED_LABEL, needsYou } from "@/lib/console/needs";
import { awayFeed, awayWindow } from "@/lib/console/data/home";
import { ButtonLink, Empty, PageHeader, buttonClass } from "@/components/console/ui";
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
          action={can.createRole(c) ? <ButtonLink href="/console/chat?new=1" tone="primary">Add a role</ButtonLink> : null}
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

  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-8 lg:pt-2">
      <PageHeader
        eyebrow={today}
        title={`Good ${greeting()}, ${c.user.name.split(" ")[0]}`}
        actions={can.createRole(c) ? <ButtonLink href="/console/chat?new=1" tone="primary">New role</ButtonLink> : null}
      />

      {/* One place to ask or instruct; Chat holds the conversation. */}
      <form action="/console/chat" method="get" className="-mt-2">
        <label htmlFor="ask" className="sr-only">
          Ask Winnow
        </label>
        <div className="flex items-center gap-2 rounded-[10px] border border-hairline bg-paper py-1.5 pl-3.5 pr-1.5 shadow-[0_1px_3px_rgb(10_12_15/0.05)] transition-[border-color,box-shadow] focus-within:border-signal/60 focus-within:shadow-[0_0_0_3px_rgb(27_77_255/0.10)]">
          <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-signal" aria-hidden="true">
            <path d="M10 2.75 11.6 8.4l5.65 1.6-5.65 1.6L10 17.25 8.4 11.6 2.75 10 8.4 8.4Z" fill="currentColor" />
          </svg>
          <input
            id="ask"
            name="q"
            placeholder="Ask Winnow, or tell it what to do: set up a role, shortlist, send questions…"
            className="h-9 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-slate/70 focus:outline-none sm:text-[13.5px]"
          />
          <button type="submit" className={`${buttonClass("secondary", "sm")} shrink-0`}>
            Ask
          </button>
        </div>
      </form>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[12px] text-slate">{s.label}</dt>
            <dd className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 border-t border-hairline pt-8 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-12">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
          <section aria-labelledby="needs">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 id="needs" className="text-[14px] font-semibold">
                Needs you
              </h2>
              {needs.length ? <span className="text-[13px] tabular-nums text-slate">{needs.length}</span> : null}
              {needs.length > 4 ? (
                <Link href="/console/inbox" className="ml-auto text-[12.5px] text-slate hover:text-ink">
                  See all {needs.length}
                </Link>
              ) : null}
            </div>
            <div className="-mx-2.5">
              <NeedsList totals={{ 0: needs.filter((n) => n.priority === 0).length, 1: needs.filter((n) => n.priority === 1).length, 2: needs.filter((n) => n.priority === 2).length }} items={needs.slice(0, 4).map((n) => ({ key: n.key, type: n.type, label: NEED_LABEL[n.type], roleTitle: n.roleTitle, roleId: n.roleId, person: n.person, ageDays: n.ageDays, text: n.text, action: n.action, priority: n.priority }))} />
            </div>
          </section>

          <section aria-labelledby="roles-title" id="roles" className="scroll-mt-20">
            <h2 id="roles-title" className="mb-3 text-[14px] font-semibold">
              Your roles
            </h2>
            <RolesTable rows={rows} />
          </section>
        </div>

        <aside aria-labelledby="away" className="min-w-0">
          <h2 id="away" className="text-[14px] font-semibold">
            While you were away
          </h2>
          <p className="mb-4 text-[12px] text-slate">Since {since.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          {feed.length === 0 ? (
            <p className="text-[13px] text-slate">Nothing new since then.</p>
          ) : (
            <ol className="grid gap-4 border-l border-hairline pl-4">
              {feed.slice(0, 8).map((f) => (
                <li key={f.id} className="relative text-[13px] leading-snug">
                  <span aria-hidden="true" className={`absolute -left-[20px] top-[5px] size-[7px] rounded-full ring-[3px] ring-paper ${f.failure ? "bg-alert" : "bg-slate/35"}`} />
                  <span className={f.failure ? "text-alert" : "text-ink"}>{f.text}</span>
                  <span className="mt-0.5 block text-[12px] text-slate">
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
        </aside>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
