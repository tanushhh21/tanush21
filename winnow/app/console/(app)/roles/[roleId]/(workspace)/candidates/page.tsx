import type { Metadata } from "next";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { loadRanking, reasonsFor, viewsFor } from "@/lib/console/data/ranking";
import Ranking from "@/components/console/ranking/Ranking";
import type { Filter } from "@/components/console/ranking/model";
import { CandidateViews } from "@/components/console/roles/Views";

export const metadata: Metadata = { title: "Everyone" };

/** Everyone, regardless of band or decision: the records view. */
export default async function Candidates({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ decision?: string; reason?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const q = await searchParams;
  const [data, reasons, views] = await Promise.all([loadRanking(role.id, role.rubricVersion), reasonsFor(c.org.id), viewsFor(c, role.id, "candidates")]);
  const initial: Filter[] = [];
  if (q.decision) initial.push({ t: "decision", values: q.decision.split(",") });
  if (q.reason) initial.push({ t: "reason", values: q.reason.split(",") });
  return (
    <div className="grid gap-4">
      <CandidateViews roleId={role.id} active="everyone" />
      <Ranking
        scope="candidates"
        roleId={role.id}
        roleTitle={role.title}
        requirements={data.requirements}
        rows={data.rows}
        reasons={reasons}
        views={views}
        canAsk={can.sendQuestions(c)}
        initialFilters={initial}
        busy={false}
      />
    </div>
  );
}
