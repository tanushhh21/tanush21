"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, roles, type ChatExtras } from "@/lib/db/schema";
import { requireCtx, visibleRoles, type Ctx } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { orgChatContext } from "@/lib/console/data/orgchat";
import { agentTools, roleSnapshot, rolesLine, runAction, type AgentState } from "@/lib/console/agent";
import { runAgent } from "@/lib/ai/agent";
import { AiError, aiConfigured } from "@/lib/ai/claude";

type Result = { ok: true } | { ok: false; error: string };

async function scopeRole(c: Ctx, roleId: string | null) {
  if (!roleId) return null;
  if (!/^[0-9a-f-]{36}$/i.test(roleId)) throw new Error("No such role.");
  const [r] = await db.select().from(roles).where(and(eq(roles.id, roleId), visibleRoles(c)));
  if (!r) throw new Error("No such role.");
  return r;
}

/**
 * One message to the assistant, in the general conversation or a role's.
 * An attached file arrives as text (see /api/console/chat/attach).
 */
export async function sendChat(roleId: string | null, text: string, attachment?: { name: string; text: string } | null): Promise<Result> {
  try {
    const c = await requireCtx();
    const role = await scopeRole(c, roleId);
    const said = text.trim().slice(0, 8000);
    if (!said && !attachment) return { ok: false, error: "Write a message." };
    if (!aiConfigured()) return { ok: false, error: "Chat needs the AI connected (ANTHROPIC_API_KEY)." };

    const thread = role
      ? and(eq(chatMessages.orgId, c.org.id), eq(chatMessages.roleId, role.id))
      : and(eq(chatMessages.orgId, c.org.id), isNull(chatMessages.roleId), eq(chatMessages.userId, c.user.id));
    const earlier = (await db.select().from(chatMessages).where(thread).orderBy(desc(chatMessages.createdAt)).limit(12)).reverse();
    const body = attachment ? `${said}${said ? "\n\n" : ""}[Attached: ${attachment.name}]\n${attachment.text.slice(0, 30000)}` : said;
    await db.insert(chatMessages).values({ orgId: c.org.id, roleId: role?.id ?? null, userId: c.user.id, author: "user", body: attachment ? `${said}${said ? "\n\n" : ""}📎 ${attachment.name}` : said });

    const context = [
      `Today is ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}. You are talking to ${c.user.name} (${c.level === "hiring_manager" ? "a hiring manager" : c.level === "ta" ? "talent acquisition" : c.level === "operator" ? "Winnow's own team" : "an admin"}) at ${c.org.name}.`,
      role ? `This conversation is about the role ${role.title} (id ${role.id}). Assume questions are about it unless they say otherwise.\n\n${await roleSnapshot(c, role.id)}` : await orgChatContext(c, said),
      `## Your roles\n${await rolesLine(c)}`,
    ].join("\n\n");
    const history = earlier.map((m) => ({ role: m.author === "user" ? ("user" as const) : ("assistant" as const), content: m.body }));
    const state: AgentState = { actions: [], links: [], touched: new Set() };
    const out = await runAgent({ context, history: [...history, { role: "user", content: body }], tools: agentTools(c, role?.id ?? null, state) });

    const extras: ChatExtras | null = state.actions.length || state.links.length ? { actions: state.actions, links: state.links } : null;
    await db.insert(chatMessages).values({ orgId: c.org.id, roleId: role?.id ?? null, userId: c.user.id, author: "winnow", body: out.reply.slice(0, 8000), extras, costUsd: out.costUsd });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: role ? "chat.role" : "chat.org", entity: role ? "role" : "org", entityId: role?.id ?? c.org.id, roleId: role?.id ?? null, detail: { question: said.slice(0, 200) } });
    if (role) await logActivity({ orgId: c.org.id, roleId: role.id, kind: "chat", message: "Chat", costUsd: out.costUsd, actorId: c.user.id });
    revalidatePath("/console/chat");
    for (const p of state.touched) revalidatePath(p, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AiError || e instanceof Error ? e.message : "Chat failed. Try again." };
  }
}

/** Runs a proposal from a reply, once, after the person presses Confirm. */
export async function confirmChatAction(messageId: string, actionId: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const { m, extras, action } = await load(c, messageId, actionId);
    if (action.state !== "proposed") return { ok: false, error: action.state === "done" ? "Already done." : "This was discarded." };
    // Claim it first, so a double click cannot run it twice.
    action.state = "done";
    const claimed = await db
      .update(chatMessages)
      .set({ extras })
      .where(and(eq(chatMessages.id, m.id), sql`${chatMessages.extras} = ${JSON.stringify(m.extras)}::jsonb`))
      .returning({ id: chatMessages.id });
    if (!claimed.length) return { ok: false, error: "Something changed. Refresh and try again." };
    const r = await runAction(c, action);
    action.state = r.ok ? "done" : "failed";
    action.result = r.ok ? r.result : r.error;
    await db.update(chatMessages).set({ extras }).where(eq(chatMessages.id, m.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "chat.confirm", entity: "chat", entityId: m.id, roleId: m.roleId, detail: { kind: action.kind, title: action.title, ok: r.ok } });
    revalidatePath("/console", "layout");
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function discardChatAction(messageId: string, actionId: string): Promise<Result> {
  try {
    const c = await requireCtx();
    const { m, extras, action } = await load(c, messageId, actionId);
    if (action.state !== "proposed") return { ok: true };
    action.state = "discarded";
    await db.update(chatMessages).set({ extras }).where(eq(chatMessages.id, m.id));
    revalidatePath("/console/chat");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** A proposal on a reply the person can see: their own general thread, or a role they can see. */
async function load(c: Ctx, messageId: string, actionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) throw new Error("Not found.");
  const m = await db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, c.org.id)) });
  if (!m?.extras) throw new Error("Not found.");
  if (m.roleId) await scopeRole(c, m.roleId);
  else if (m.userId !== c.user.id) throw new Error("Not found.");
  const extras = structuredClone(m.extras);
  const action = extras.actions.find((a) => a.id === actionId);
  if (!action) throw new Error("Not found.");
  return { m, extras, action };
}
