import type { Metadata } from "next";
import Link from "next/link";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { summarizeRoles } from "@/lib/console/roles";
import { threadFor } from "@/lib/console/data/chat";
import { sendChat } from "@/lib/console/actions/chat";
import { aiConfigured } from "@/lib/ai/claude";
import ChatPanel from "@/components/console/chat/ChatPanel";
import ScopePicker from "@/components/console/chat/ScopePicker";
import Uploader from "@/components/console/roles/Uploader";

export const metadata: Metadata = { title: "Chat" };
// One turn can read several things and act before it answers.
export const maxDuration = 300;

/**
 * One place to talk to Winnow and have it do the work: a general
 * conversation across every role (where new roles are set up), and one per
 * role. On phones the list of conversations becomes a picker.
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string; new?: string }> }) {
  const c = await requireCtx();
  const sp = await searchParams;
  const roles = await summarizeRoles(c, { includeClosed: true });
  const role = sp.role ? await requireRole(c, sp.role) : null;
  const newRole = !role && sp.new === "1";
  const off = aiConfigured()
    ? null
    : c.user.isOperator
      ? "The AI is not connected yet: add GROQ_API_KEY (or ANTHROPIC_API_KEY) in Vercel and redeploy."
      : "Chat is not switched on for your workspace yet. Winnow's team has been told.";

  const messages = (await threadFor(c, role?.id ?? null)).map((m) => ({ id: m.id, author: m.author, body: m.body, diff: m.diff, diffState: m.diffState, extras: m.extras, at: m.createdAt.toISOString() }));

  const open = roles.filter((r) => r.state !== "closed");
  const closed = roles.filter((r) => r.state === "closed");
  const item = (href: string, label: string, sub: string, active: boolean) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`block rounded-[6px] px-2.5 py-1.5 transition-colors ${active ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"}`}>
      <span className={`block truncate text-[13px] ${active ? "font-medium text-ink" : "text-ink"}`}>{label}</span>
      <span className="block truncate text-[12px] text-slate">{sub}</span>
    </Link>
  );

  return (
    <div className="-mb-20 flex h-[calc(100svh-6.5rem)] gap-6 lg:h-[calc(100svh-4rem)]">
      <nav aria-label="Conversations" className="hidden w-56 shrink-0 flex-col gap-px overflow-y-auto border-r border-hairline pr-3 md:flex">
        {can.createRole(c) ? (
          <Link href="/console/chat?new=1" className="mb-3 inline-flex h-8 items-center justify-center rounded-[6px] border border-hairline bg-paper px-3 text-[13px] font-medium text-ink shadow-[0_1px_1px_rgb(10_12_15/0.04)] hover:bg-mist">
            + New role
          </Link>
        ) : null}
        <p className="px-2.5 pb-1 text-[12px] font-medium text-slate">Conversations</p>
        {item("/console/chat", "All roles", "Across the company, and new roles", !role)}
        {open.length ? <p className="mt-3 px-2.5 pb-1 text-[12px] font-medium text-slate">Open roles</p> : null}
        {open.map((r) => item(`/console/chat?role=${r.id}`, r.title, `${r.received} candidates · ${r.status}`, role?.id === r.id))}
        {closed.length ? <p className="mt-3 px-2.5 pb-1 text-[12px] font-medium text-slate">Closed</p> : null}
        {closed.map((r) => item(`/console/chat?role=${r.id}`, r.title, "Closed", role?.id === r.id))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 md:hidden">
          <ScopePicker value={role?.id ?? ""} roles={roles.map((r) => ({ id: r.id, title: r.title, closed: r.state === "closed" }))} />
        </div>
        <ChatPanel
          key={`${role?.id ?? "all"}${newRole ? "-new" : ""}`}
          title={role ? role.title : newRole ? "New role" : "All roles"}
          hint={
            role
              ? "Ask about this role and its candidates, or tell Winnow what to do. Anything that affects candidates waits for your confirmation."
              : newRole
                ? "Describe the role in your own words, or paste or attach the job description. Winnow sets it up and decides what to screen on."
                : "Ask across every role you can see, or tell Winnow what to do: set up a role, shortlist, send questions."
          }
          actions={
            role && role.state === "open" && can.manageSources(c) ? (
              <>
                <Uploader roleId={role.id} compact />
                <Link href={`/console/roles/${role.id}`} className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] text-slate hover:bg-mist hover:text-ink">
                  Open role
                </Link>
              </>
            ) : role ? (
              <Link href={`/console/roles/${role.id}`} className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] text-slate hover:bg-mist hover:text-ink">
                Open role
              </Link>
            ) : null
          }
          messages={messages}
          send={sendChat.bind(null, role?.id ?? null)}
          canApply={can.editRubric(c)}
          off={off}
          initial={sp.q ?? (newRole ? "Set up a new role: " : "")}
          starter={newRole ? { title: "Tell Winnow about the role", body: "Who you are hiring, where, how many, the pay band, and what they must have. Or attach the job description. Some examples:" } : undefined}
          suggestions={
            role
              ? ["Who should I interview first, and why?", "Shortlist the top two", "Who is close to the top but needs one claim checked?", "What would change if we made the second requirement a must-have?"]
              : newRole
                ? [
                    "Set up a role for a Senior Data Engineer in Pune, 2 openings, 30-45 LPA. Must know Spark and Airflow.",
                    "We're hiring a Product Designer in Bengaluru, 20-28 LPA, who has designed payments flows.",
                  ]
                : ["Which of my roles needs attention?", "Who is waiting on a decision from me?", "Who did we turn down for pay expectations this month?", "Which source is giving us the best candidates?"]
          }
        />
      </div>
    </div>
  );
}
