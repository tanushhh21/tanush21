"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { chatMessages, dismissals } from "@/lib/db/schema";
import { requireCtx } from "@/lib/console/context";
import { audit } from "@/lib/console/log";
import { orgChatHistory } from "@/lib/console/data/home";
import { orgChatContext } from "@/lib/console/data/orgchat";
import { orgChat } from "@/lib/ai/tasks";
import { AiError, aiConfigured } from "@/lib/ai/claude";

/** Dismissals are a signal: an item type everyone dismisses should not exist (see Analytics). */
export async function dismissNeed(key: string, type: string, reason: string) {
  const c = await requireCtx();
  const r = reason.trim().slice(0, 200);
  if (!r) return { ok: false as const, error: "Say why, so we can stop showing things that do not help." };
  await db.insert(dismissals).values({ orgId: c.org.id, userId: c.user.id, itemKey: key.slice(0, 300), itemType: type.slice(0, 40), reason: r });
  revalidatePath("/console", "layout");
  return { ok: true as const };
}

/** Org chat reads across roles and never writes. */
export async function sendOrgChat(text: string): Promise<{ ok: boolean; error?: string }> {
  const c = await requireCtx();
  const q = text.trim().slice(0, 4000);
  if (!q) return { ok: false, error: "Ask something." };
  if (!aiConfigured()) return { ok: false, error: "Chat needs the Claude connection (ANTHROPIC_API_KEY)." };
  const history = await orgChatHistory(c);
  await db.insert(chatMessages).values({ orgId: c.org.id, roleId: null, userId: c.user.id, author: "user", body: q });
  try {
    const out = await orgChat(await orgChatContext(c, q), [
      ...history.slice(-10).map((m) => ({ role: m.author === "user" ? ("user" as const) : ("assistant" as const), content: m.body })),
      { role: "user" as const, content: q },
    ]);
    await db.insert(chatMessages).values({ orgId: c.org.id, roleId: null, userId: c.user.id, author: "winnow", body: out.data.reply, costUsd: out.costUsd });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "chat.org", entity: "org", entityId: c.org.id, detail: { question: q.slice(0, 200) } });
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "Chat failed. Try again." };
  }
  revalidatePath("/console");
  return { ok: true };
}
