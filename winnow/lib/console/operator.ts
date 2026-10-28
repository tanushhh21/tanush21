/**
 * Work Winnow's own operators do across customers. Asking Winnow to source a
 * role turns its rubric into Boolean searches, queued in the operator console.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { booleanSearches, roles } from "@/lib/db/schema";
import { searchPlan } from "@/lib/ai/tasks";
import { currentRequirements } from "./scoring";
import { logActivity } from "./log";

export async function generateSearches(roleId: string) {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role || role.rubricVersion === 0) return;
  const reqs = await currentRequirements(roleId, role.rubricVersion);
  try {
    const out = await searchPlan(
      role.title,
      reqs.map((q) => ({ key: q.key, text: q.text, weight: q.weight, mustHave: q.mustHave, keywords: q.keywords, minYears: q.minYears, recencySensitive: q.recencySensitive })),
      role.locations,
    );
    if (out.data.searches.length)
      await db.insert(booleanSearches).values(out.data.searches.map((s) => ({ orgId: role.orgId, roleId, query: s.query, target: s.target, group: s.group })));
    await logActivity({ orgId: role.orgId, roleId, kind: "sourcing_planned", message: `Planned ${out.data.searches.length} searches for sourcing`, costUsd: out.costUsd });
  } catch (e) {
    await logActivity({ orgId: role.orgId, roleId, kind: "sourcing_failed", message: `Could not plan the searches: ${e instanceof Error ? e.message : e}` });
  }
}
