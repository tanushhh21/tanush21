import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships, users } from "@/lib/db/schema";

/** Everyone active in the org, for pickers (hiring manager, interviewer, visibility). */
export async function teamFor(orgId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, access: memberships.access })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), isNull(memberships.deactivatedAt)))
    .orderBy(asc(users.name));
}
