/**
 * The company brain: what Winnow believes about a company, each belief with
 * its provenance and confidence. It is given to the AI as context.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyFacts, type FactGroup } from "@/lib/db/schema";

export const GROUPS: { key: FactGroup; label: string }[] = [
  { key: "what_you_build", label: "What you build" },
  { key: "stage_scale", label: "Stage and scale" },
  { key: "stack", label: "Stack" },
  { key: "team", label: "Team composition" },
  { key: "operating_reality", label: "Operating reality" },
  { key: "compensation", label: "Compensation reality" },
  { key: "locations", label: "Locations and attendance" },
  { key: "past_hires", label: "What has gone wrong in past hires" },
  { key: "vocabulary", label: "Your level ladder and vocabulary" },
];

export async function companyContext(orgId: string) {
  const facts = await db
    .select({ group: companyFacts.group, text: companyFacts.text, provenance: companyFacts.provenance })
    .from(companyFacts)
    .where(and(eq(companyFacts.orgId, orgId), eq(companyFacts.active, true)));
  if (facts.length === 0) return "";
  return GROUPS.filter((g) => facts.some((f) => f.group === g.key))
    .map((g) => `${g.label}:\n${facts.filter((f) => f.group === g.key).map((f) => `- ${f.text}${f.provenance === "inferred" ? " (inferred)" : ""}`).join("\n")}`)
    .join("\n\n");
}
