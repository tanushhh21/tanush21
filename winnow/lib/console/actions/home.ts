"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { dismissals, users } from "@/lib/db/schema";
import { normalizeLayout } from "@/lib/console/homeLayout";
import { requireCtx } from "@/lib/console/context";

/** Dismissals are a signal: an item type everyone dismisses should not exist (see Analytics). */
export async function dismissNeed(key: string, type: string, reason: string) {
  const c = await requireCtx();
  const r = reason.trim().slice(0, 200);
  if (!r) return { ok: false as const, error: "Say why, so we can stop showing things that do not help." };
  await db.insert(dismissals).values({ orgId: c.org.id, userId: c.user.id, itemKey: key.slice(0, 300), itemType: type.slice(0, 40), reason: r });
  revalidatePath("/console", "layout");
  return { ok: true as const };
}

/** Saves this person's own Home arrangement. Only their row changes; nobody else's Home moves. */
export async function saveHomeLayout(layout: unknown) {
  const c = await requireCtx();
  const clean = layout === null ? null : normalizeLayout(layout);
  await db.update(users).set({ homeLayout: clean }).where(eq(users.id, c.user.id));
  revalidatePath("/console");
  return { ok: true as const };
}
