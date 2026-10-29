import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyFacts, users } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { GROUPS, inferBeliefs } from "@/lib/console/brain";
import { SettingsHead } from "@/components/console/ui";
import Brain from "@/components/console/brain/Brain";

export const metadata: Metadata = { title: "Company knowledge" };

export default async function Knowledge() {
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
      <SettingsHead title="Company knowledge" meta="What Winnow knows about your company and where each fact came from. It uses this on every role, so correct anything that is wrong." />
      <Brain
        groups={GROUPS}
        canEdit={can.editRubric(c)}
        facts={facts.map(({ f, by }) => ({ id: f.id, group: f.group, text: f.text, provenance: f.provenance, confidence: f.confidence, evidence: f.evidence, active: f.active, by, at: f.updatedAt.toISOString() }))}
      />
    </div>
  );
}
