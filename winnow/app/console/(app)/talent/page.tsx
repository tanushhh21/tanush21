import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { can, requireCtx, visibleRoles } from "@/lib/console/context";
import { loadTalent } from "@/lib/console/data/talent";
import { Empty, PageHeader } from "@/components/console/ui";
import TalentList from "@/components/console/talent/TalentList";

export const metadata: Metadata = { title: "People" };

export default async function Talent({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const c = await requireCtx();
  const view = (await searchParams).view;
  const [{ rows, pools, truncated }, open] = await Promise.all([
    loadTalent(c),
    db.select({ id: roles.id, title: roles.title }).from(roles).where(and(visibleRoles(c), eq(roles.state, "open"), gt(roles.rubricVersion, 0))),
  ]);
  const silver = rows.filter((r) => r.silver).length;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="People"
        meta={`Everyone who has applied to any of your roles: ${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? "person" : "people"}${silver ? `, ${silver} who nearly got an offer` : ""}. Search them, group them, and rank any of them for an open role.`}
      />
      {rows.length === 0 ? (
        <Empty title="Nobody here yet">Everyone who applies to any role lands here, searchable and re-rankable against your next role.</Empty>
      ) : (
        <TalentList rows={rows} pools={pools} openRoles={open} canRerank={can.manageSources(c)} initialView={view === "silver" ? "silver" : "all"} truncated={truncated} />
      )}
    </div>
  );
}
