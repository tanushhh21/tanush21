"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireCtx } from "@/lib/console/context";

export async function markAllRead() {
  const c = await requireCtx();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, c.user.id), eq(notifications.orgId, c.org.id), isNull(notifications.readAt)));
  revalidatePath("/console", "layout");
}

export async function openNotification(form: FormData) {
  const c = await requireCtx();
  const id = String(form.get("id") ?? "");
  const [n] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, c.user.id)))
    .returning();
  redirect(n?.href && n.href.startsWith("/console") ? n.href : "/console/notifications");
}
