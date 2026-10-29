"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dismissals } from "@/lib/db/schema";
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
