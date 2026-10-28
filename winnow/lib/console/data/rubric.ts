import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hardFilters, refusedCriteria, requirements, rubricVersions, users } from "@/lib/db/schema";

export async function loadRubric(roleId: string, version: number) {
  const [v] = await db
    .select({ v: rubricVersions, by: users.name })
    .from(rubricVersions)
    .leftJoin(users, eq(users.id, rubricVersions.createdBy))
    .where(and(eq(rubricVersions.roleId, roleId), eq(rubricVersions.version, version)));
  if (!v) return null;
  const [reqs, refused, filters] = await Promise.all([
    db.select().from(requirements).where(eq(requirements.rubricVersionId, v.v.id)).orderBy(asc(requirements.position)),
    db.select().from(refusedCriteria).where(eq(refusedCriteria.rubricVersionId, v.v.id)),
    db.select().from(hardFilters).where(eq(hardFilters.roleId, roleId)).orderBy(desc(hardFilters.active), asc(hardFilters.createdAt)),
  ]);
  return { version: v.v, by: v.by, requirements: reqs, refused, filters };
}

export type Rubric = NonNullable<Awaited<ReturnType<typeof loadRubric>>>;

export async function versionHistory(roleId: string) {
  return db
    .select({ v: rubricVersions, by: users.name })
    .from(rubricVersions)
    .leftJoin(users, eq(users.id, rubricVersions.createdBy))
    .where(eq(rubricVersions.roleId, roleId))
    .orderBy(desc(rubricVersions.version));
}
