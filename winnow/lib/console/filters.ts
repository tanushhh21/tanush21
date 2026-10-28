/**
 * Hard filters remove people; weights rank them. A filter only removes someone
 * when the fact it tests is known: an unknown notice period never excludes.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationFacts, evaluations, hardFilters } from "@/lib/db/schema";

export const FILTER_FIELDS: Record<string, { label: string; numeric: boolean; unit?: string }> = {
  notice_period_days: { label: "Notice period", numeric: true, unit: "days" },
  expected_ctc: { label: "Expected CTC", numeric: true, unit: "₹ per year" },
  current_ctc: { label: "Current CTC", numeric: true, unit: "₹ per year" },
  years_experience: { label: "Years of experience", numeric: true, unit: "years" },
  city: { label: "City", numeric: false },
  willing_to_relocate: { label: "Willing to relocate", numeric: false },
  degree: { label: "Degree", numeric: false },
};

export const OP_LABEL: Record<string, string> = { lte: "at most", lt: "under", gte: "at least", gt: "over", eq: "is", neq: "is not", in: "is one of", contains: "contains" };

type Filter = typeof hardFilters.$inferSelect;
type Fact = { field: string; value: string; num: number | null };

export function excludedBy(f: Filter, facts: Fact[]): boolean {
  const fact = facts.find((x) => x.field === f.field);
  if (!fact) return false;
  const v = f.value;
  if (FILTER_FIELDS[f.field]?.numeric) {
    const n = fact.num;
    const limit = Number(v);
    if (n == null || Number.isNaN(limit)) return false;
    return f.op === "lte" ? n > limit : f.op === "lt" ? n >= limit : f.op === "gte" ? n < limit : f.op === "gt" ? n <= limit : f.op === "eq" ? n !== limit : f.op === "neq" ? n === limit : false;
  }
  const text = fact.value.toLowerCase();
  const list = (Array.isArray(v) ? v : String(v).split(",")).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (f.op === "in") return !list.some((x) => text.includes(x));
  if (f.op === "eq") return !list.some((x) => text === x);
  if (f.op === "neq") return list.some((x) => text === x);
  if (f.op === "contains") return !list.some((x) => text.includes(x));
  return false;
}

export function describe(f: Pick<Filter, "field" | "op" | "value">) {
  const meta = FILTER_FIELDS[f.field];
  const v = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
  const shown = meta?.numeric && f.field.endsWith("ctc") ? `₹${Number(v).toLocaleString("en-IN")}` : meta?.unit && meta.numeric ? `${v} ${meta.unit}` : v;
  return `${meta?.label ?? f.field} ${OP_LABEL[f.op] ?? f.op} ${shown}`;
}

/** Marks which of these applications the role's active filters remove. */
export async function applyHardFilters(roleId: string, applicationIds: string[], version: number) {
  if (applicationIds.length === 0) return;
  const filters = await db.select().from(hardFilters).where(and(eq(hardFilters.roleId, roleId), eq(hardFilters.active, true)));
  const facts = await db
    .select({ applicationId: applicationFacts.applicationId, field: applicationFacts.field, value: applicationFacts.value, num: applicationFacts.num })
    .from(applicationFacts)
    .where(inArray(applicationFacts.applicationId, applicationIds));
  for (const id of applicationIds) {
    const mine = facts.filter((f) => f.applicationId === id);
    const out = filters.some((f) => excludedBy(f, mine));
    await db
      .update(evaluations)
      .set({ filteredOut: out })
      .where(and(eq(evaluations.applicationId, id), eq(evaluations.rubricVersion, version)));
  }
}
