import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { evaluations, roles as rolesTable } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { summarizeRoles, statusTone } from "@/lib/console/roles";
import { NEED_LABEL, needsYou } from "@/lib/console/needs";
import { awayFeed, awayWindow, orgChatHistory } from "@/lib/console/data/home";
import { sendOrgChat } from "@/lib/console/actions/home";
import { ButtonLink, Empty, PageHeader } from "@/components/console/ui";
import NeedsList from "@/components/console/home/NeedsList";
import RolesTable, { type RoleRow } from "@/components/console/home/RolesTable";
import Chat from "@/components/console/Chat";

export const metadata: Metadata = { title: "Home" };

const STAGE_LABEL: [string, string][] = [
  ["new", "new"],
  ["screening", "screening"],
  ["shortlisted", "shortlisted"],
  ["interviewing", "interviewing"],
  ["offer", "offer"],
  ["hired", "hired"],
];

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
            ? "Paste a job description, upload one, or describe the role. Winnow builds the rubric and starts ranking."
            : "Roles you are part of will appear here."}
        </Empty>
      </div>
    );
  }

  const since = await awayWindow(c);
  const [feed, chat] = await Promise.all([awayFeed(c, since), orgChatHistory(c)]);
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
  const open = roles.filter((r) => r.state !== "closed");
  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    title: r.title,
    manager: r.hiringManager,
    mine: r.hiringManagerId === c.user.id || r.createdBy === c.user.id,
    daysOpen: r.daysOpen,
    received: r.received,
    scored: r.scored,
    failed: r.failed,
    failReason: failures.find((f) => f.roleId === r.id)?.error ?? null,
    unreadable: r.unreadable,
    shortlisted: r.shortlisted,
    stages: STAGE_LABEL.map(([k, label]) => ({ label, n: r.stages[k as keyof typeof r.stages] ?? 0 })),
    status: r.status,
    tone: statusTone(r.status),
    risk: r.risk,
  }));
  const stalled = open.filter((r) => r.status === "stalled").length;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Good ${greeting()}, ${c.user.name.split(" ")[0]}`}
        meta={`${needs.length ? `${needs.length} thing${needs.length === 1 ? "" : "s"} need${needs.length === 1 ? "s" : ""} you` : "Nothing needs you"} across ${open.length} open role${open.length === 1 ? "" : "s"}${stalled ? `, ${stalled} stalled` : ""}`}
        actions={can.createRole(c) ? <ButtonLink href="/console/roles/new" tone="primary">Add a role</ButtonLink> : null}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
          <section aria-labelledby="needs">
            <h2 id="needs" className="mb-3 font-display text-[16px] font-semibold">
              Needs you
            </h2>
            <NeedsList items={needs.map((n) => ({ key: n.key, type: n.type, label: NEED_LABEL[n.type], roleTitle: n.roleTitle, roleId: n.roleId, person: n.person, ageDays: n.ageDays, text: n.text, action: n.action }))} />
          </section>

          <section aria-labelledby="roles">
            <h2 id="roles" className="mb-3 font-display text-[16px] font-semibold">
              Your roles
            </h2>
            <RolesTable rows={rows} />
          </section>
        </div>

        <aside className="grid min-w-0 gap-6">
          <section aria-labelledby="away">
            <h2 id="away" className="font-display text-[16px] font-semibold">
              While you were away
            </h2>
            <p className="mb-3 text-[12px] text-slate">Since {since.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
            {feed.length === 0 ? (
              <p className="text-[13.5px] text-slate">Nothing new since then.</p>
            ) : (
              <ol className="grid gap-2.5">
                {feed.map((f) => (
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
          <Chat
            title="Ask across your roles"
            placeholder="Which of my roles is stalled? Who have we rejected for compensation this quarter? Have we seen Priya Sharma before? Which source is actually working?"
            send={sendOrgChat}
            canApply={false}
            messages={chat.map((m) => ({ id: m.id, author: m.author, body: m.body, diff: null, diffState: null, at: m.createdAt.toISOString() }))}
          />
        </aside>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
