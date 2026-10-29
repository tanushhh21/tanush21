import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { summarizeRoles } from "@/lib/console/roles";
import { orgChatHistory } from "@/lib/console/data/home";
import { sendOrgChat } from "@/lib/console/actions/home";
import { sendRoleChat } from "@/lib/console/actions/rubric";
import { aiConfigured } from "@/lib/ai/claude";
import ChatPanel from "@/components/console/chat/ChatPanel";
import ScopePicker from "@/components/console/chat/ScopePicker";

export const metadata: Metadata = { title: "Chat" };

/**
 * One place to talk to Winnow: a general conversation across every role,
 * and one per role. On phones the list of conversations becomes a picker.
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  const c = await requireCtx();
  const sp = await searchParams;
  const roles = await summarizeRoles(c, { includeClosed: true });
  const role = sp.role ? await requireRole(c, sp.role) : null;
  const off = aiConfigured()
    ? null
    : c.user.isOperator
      ? "The AI is not connected yet: add ANTHROPIC_API_KEY in Vercel and redeploy."
      : "Chat is not switched on for your workspace yet. Winnow's team has been told.";

  const messages = role
    ? (await db.select().from(chatMessages).where(and(eq(chatMessages.roleId, role.id), eq(chatMessages.orgId, c.org.id))).orderBy(asc(chatMessages.createdAt)).limit(200)).map((m) => ({ id: m.id, author: m.author, body: m.body, diff: m.diff, diffState: m.diffState, at: m.createdAt.toISOString() }))
    : (await orgChatHistory(c)).map((m) => ({ id: m.id, author: m.author, body: m.body, diff: null, diffState: null, at: m.createdAt.toISOString() }));

  const open = roles.filter((r) => r.state !== "closed");
  const closed = roles.filter((r) => r.state === "closed");
  const item = (href: string, label: string, sub: string, active: boolean) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`block rounded-[10px] px-3 py-2 transition-colors ${active ? "bg-mist" : "hover:bg-mist/60"}`}>
      <span className={`block truncate text-[13.5px] ${active ? "font-medium text-ink" : "text-ink"}`}>{label}</span>
      <span className="block truncate text-[12px] text-slate">{sub}</span>
    </Link>
  );

  return (
    <div className="-mb-20 flex h-[calc(100svh-6.5rem)] gap-6 lg:h-[calc(100svh-4rem)]">
      <nav aria-label="Conversations" className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline pr-4 md:flex">
        <p className="px-3 pb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-slate/80">Conversations</p>
        {item("/console/chat", "All roles", "Questions across the company", !role)}
        {open.length ? <p className="mt-3 px-3 pb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-slate/80">Open roles</p> : null}
        {open.map((r) => item(`/console/chat?role=${r.id}`, r.title, `${r.received} candidates · ${r.status}`, role?.id === r.id))}
        {closed.length ? <p className="mt-3 px-3 pb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-slate/80">Closed</p> : null}
        {closed.map((r) => item(`/console/chat?role=${r.id}`, r.title, "Closed", role?.id === r.id))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 md:hidden">
          <ScopePicker value={role?.id ?? ""} roles={roles.map((r) => ({ id: r.id, title: r.title, closed: r.state === "closed" }))} />
        </div>
        <ChatPanel
          key={role?.id ?? "all"}
          title={role ? role.title : "All roles"}
          hint={role ? "Ask about this role and its candidates, or ask for a change. Changes wait for your confirmation." : "Ask across every role you can see: who is stuck, why people were turned down, which source works."}
          messages={messages}
          send={role ? sendRoleChat.bind(null, role.id) : sendOrgChat}
          canApply={can.editRubric(c)}
          off={off}
          initial={sp.q ?? ""}
          suggestions={
            role
              ? ["Who should I interview first, and why?", "Why is the top candidate ranked first?", "What would change if we dropped the weakest requirement?", "Who is close to the top but needs one claim checked?"]
              : ["Which of my roles needs attention?", "Who did we turn down for compensation this month?", "Which source is giving us the best candidates?", "Have we seen anyone good for a backend role before?"]
          }
        />
      </div>
    </div>
  );
}
