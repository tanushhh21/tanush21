import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, evaluations, questions, refusedCriteria, rubricVersions, users } from "@/lib/db/schema";
import { currentRequirements } from "@/lib/console/scoring";
import { can, daysSince, requireCtx, requireRole } from "@/lib/console/context";
import { Badge, dateLabel, inr } from "@/components/console/ui";
import Tabs from "@/components/console/roles/Tabs";
import Uploader from "@/components/console/roles/Uploader";

/** Role workspace: header, rubric strip and tabs, shared by every role screen. */
export default async function Workspace({ children, params }: { children: React.ReactNode; params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const [manager] = role.hiringManagerId ? await db.select({ name: users.name }).from(users).where(eq(users.id, role.hiringManagerId)) : [];
  const [counts] = await db
    .select({
      received: sql<number>`count(distinct ${applications.id})::int`,
      unreadable: sql<number>`count(distinct ${applications.id}) filter (where ${applications.parseStatus} = 'unreadable')::int`,
      scored: sql<number>`count(distinct ${evaluations.id}) filter (where ${evaluations.status} = 'done')::int`,
      shortlisted: sql<number>`count(distinct ${applications.id}) filter (where ${applications.decision} = 'shortlisted')::int`,
    })
    .from(applications)
    .leftJoin(evaluations, and(eq(evaluations.applicationId, applications.id), eq(evaluations.rubricVersion, role.rubricVersion)))
    .where(eq(applications.roleId, role.id));
  const strip = role.rubricVersion ? await rubricStrip(role.id, role.rubricVersion) : null;
  const [drafted] = await db
    .select({ n: sql<number>`count(distinct ${questions.applicationId})::int` })
    .from(questions)
    .where(and(eq(questions.roleId, role.id), eq(questions.status, "drafted")));

  const meta = [
    c.org.name,
    role.locations.join(", ") || null,
    `${daysSince(role.createdAt)} days open`,
    role.targetDate ? `target ${dateLabel(role.targetDate)}` : null,
    manager?.name ? `hiring manager ${manager.name}` : null,
    `${role.openings} opening${role.openings === 1 ? "" : "s"}`,
    role.compMin || role.compMax ? `${inr(role.compMin)}–${inr(role.compMax)}` : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-5">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(1.375rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em]">
              {role.title}
              {role.state !== "open" ? <Badge tone="muted" className="ml-2 align-middle">{role.state === "closed" ? "Closed" : "On hold"}</Badge> : null}
            </h1>
            <p className="mt-1 text-[13px] text-slate">{meta.join(" · ")}</p>
          </div>
          {can.manageSources(c) && role.state === "open" ? (
            <div className="flex items-center gap-2">
              <Uploader roleId={role.id} compact />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12.5px] tabular-nums text-slate">
          <span>
            <span className="text-ink">{counts.received}</span> received
          </span>
          <span>
            <span className="text-ink">{counts.scored}</span> scored
          </span>
          <span>
            <span className={counts.unreadable ? "text-alert" : "text-ink"}>{counts.unreadable}</span> unreadable
          </span>
          <span>
            <span className="text-ink">{counts.shortlisted}</span> shortlisted
          </span>
        </div>
        {strip ? (
          <p className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
            Screening on {strip.reqs} requirements, {strip.must} must-have{strip.must === 1 ? "" : "s"}
            {strip.refused ? `, ${strip.refused} criteria refused` : ""}. Personal attributes are removed before scoring.{" "}
            <Link href={`/console/roles/${role.id}/rubric`} className="text-signal hover:underline">
              Rubric v{role.rubricVersion}
            </Link>
          </p>
        ) : null}
        <Tabs roleId={role.id} counts={{ verify: drafted?.n ?? 0 }} />
      </header>
      {children}
    </div>
  );
}

/** What we are screening on, in one line. */
async function rubricStrip(roleId: string, version: number) {
  const reqs = await currentRequirements(roleId, version);
  const [refused] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(refusedCriteria)
    .innerJoin(rubricVersions, eq(rubricVersions.id, refusedCriteria.rubricVersionId))
    .where(and(eq(rubricVersions.roleId, roleId), eq(rubricVersions.version, version), eq(refusedCriteria.addedAnyway, false)));
  return { reqs: reqs.length, must: reqs.filter((r) => r.mustHave).length, refused: refused?.n ?? 0 };
}
