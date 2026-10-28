import type { Metadata } from "next";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { loadCandidate } from "@/lib/console/data/candidate";
import { reasonsFor } from "@/lib/console/data/ranking";
import Compare from "@/components/console/candidate/Compare";
import { Empty } from "@/components/console/ui";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ ids?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 5);
  const people = (await Promise.all(ids.map((id) => loadCandidate(c, id)))).filter((p) => p && p.role.id === role.id) as NonNullable<Awaited<ReturnType<typeof loadCandidate>>>[];
  if (people.length < 2) return <Empty title="Pick two to five candidates">On the ranking, press c on each candidate you want to compare.</Empty>;
  return <Compare roleId={role.id} people={people} reasons={await reasonsFor(c.org.id)} canAsk={can.sendQuestions(c)} />;
}
