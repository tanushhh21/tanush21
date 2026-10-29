import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import type { Ctx } from "@/lib/console/context";

/** A conversation for the chat page: a role's (shared with the team) or the person's own general one. */
export async function threadFor(c: Ctx, roleId: string | null) {
  const where = roleId
    ? and(eq(chatMessages.orgId, c.org.id), eq(chatMessages.roleId, roleId))
    : and(eq(chatMessages.orgId, c.org.id), isNull(chatMessages.roleId), eq(chatMessages.userId, c.user.id));
  return db.select().from(chatMessages).where(where).orderBy(asc(chatMessages.createdAt)).limit(200);
}
