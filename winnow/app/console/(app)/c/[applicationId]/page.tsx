import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, evaluations, persons } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { loadCandidate } from "@/lib/console/data/candidate";
import { reasonsFor } from "@/lib/console/data/ranking";
import { fetchCandidate } from "@/lib/console/actions/candidates";
import CandidatePage from "@/components/console/candidate/CandidatePage";

export const metadata: Metadata = { title: "Candidate" };

export default async function Candidate({ params }: { params: Promise<{ applicationId: string }> }) {
  const c = await requireCtx();
  const { applicationId } = await params;
  // fetchCandidate also records the view (and the hiring manager having looked).
  const data = (await fetchCandidate(applicationId)) ?? (await loadCandidate(c, applicationId));
  if (!data) notFound();
  const reasons = await reasonsFor(c.org.id);
  const ranked = await db
    .select({ id: applications.id, name: persons.name, rank: evaluations.rank })
    .from(evaluations)
    .innerJoin(applications, eq(applications.id, evaluations.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(eq(evaluations.roleId, data.role.id), eq(evaluations.rubricVersion, data.role.version), isNotNull(evaluations.rank)))
    .orderBy(asc(evaluations.rank));
  const i = ranked.findIndex((r) => r.id === data.id);
  const neighbours = [ranked[i - 1], ranked[i + 1], ranked[i - 2], ranked[i + 2]].filter(Boolean);
  return (
    <div className="mx-auto max-w-[46rem]">
      <p className="mb-4 text-[13px]">
        <Link href={`/console/roles/${data.role.id}`} className="text-signal hover:underline">
          ← {data.role.title}
        </Link>
      </p>
      <CandidatePage data={data} reasons={reasons} canAsk={can.sendQuestions(c)} neighbours={neighbours} />
    </div>
  );
}
