import type { Metadata } from "next";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { loadRanking, reasonsFor, viewsFor } from "@/lib/console/data/ranking";
import Ranking from "@/components/console/ranking/Ranking";
import Waiter from "@/components/console/roles/Waiter";
import { CandidateViews } from "@/components/console/roles/Views";
import { Empty } from "@/components/console/ui";
import type { Filter } from "@/components/console/ranking/model";

export const metadata: Metadata = { title: "Candidates" };

export default async function RankingPage({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ view?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const { view } = await searchParams;
  const [data, reasons, views, [busy]] = await Promise.all([
    loadRanking(role.id, role.rubricVersion),
    reasonsFor(c.org.id),
    viewsFor(c, role.id, "ranking"),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.roleId, role.id), inArray(jobs.status, ["queued", "running"]))),
  ]);
  if (role.rubricVersion === 0 && data.rows.length === 0) {
    return (
      <Empty title="Building the rubric" action={null}>
        Winnow is reading the role. Add CVs with the button above; they are ranked as soon as the rubric is ready.
        <Waiter roleId={role.id} until="rubric" />
      </Empty>
    );
  }
  const initial: Filter[] = view === "shortlisted" ? [{ t: "decision", values: ["shortlisted"] }] : [];
  return (
    <div className="grid gap-4">
      <CandidateViews roleId={role.id} active="ranked" />
      <Ranking
      scope="ranking"
      roleId={role.id}
      roleTitle={role.title}
      requirements={data.requirements}
      rows={data.rows}
      reasons={reasons}
      views={views}
      canAsk={can.sendQuestions(c)}
      initialFilters={initial}
      busy={(busy?.n ?? 0) > 0}
    />
    </div>
  );
}
