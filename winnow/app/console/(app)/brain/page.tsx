import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyFacts, users } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { GROUPS, inferBeliefs } from "@/lib/console/brain";
import { PageHeader } from "@/components/console/ui";
import Brain from "@/components/console/brain/Brain";

export const metadata: Metadata = { title: "Company brain" };

export default async function BrainPage() {
  const c = await requireCtx();
  // Cheap, and keeps inferred beliefs in step with the latest decisions.
  await inferBeliefs(c.org.id);
  const facts = await db
    .select({ f: companyFacts, by: users.name })
    .from(companyFacts)
    .leftJoin(users, eq(users.id, companyFacts.updatedBy))
    .where(and(eq(companyFacts.orgId, c.org.id)))
    .orderBy(desc(companyFacts.active), desc(companyFacts.confidence));
  return (
    <div className="grid gap-6">
      <PageHeader title="Company brain" meta="What Winnow believes about your company, and where each belief came from. It is given to Winnow on every role, so correct anything wrong: every correction is a learning signal." />
      <Brain
        groups={GROUPS}
        canEdit={can.editRubric(c)}
        facts={facts.map(({ f, by }) => ({ id: f.id, group: f.group, text: f.text, provenance: f.provenance, confidence: f.confidence, evidence: f.evidence, active: f.active, by, at: f.updatedAt.toISOString() }))}
      />
    </div>
  );
}
