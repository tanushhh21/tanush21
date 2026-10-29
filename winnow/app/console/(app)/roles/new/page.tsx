import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { assertCan, can, requireCtx, visibleRoles } from "@/lib/console/context";
import { createRole } from "@/lib/console/actions/roles";
import { aiConfigured } from "@/lib/ai/claude";
import { PageHeader } from "@/components/console/ui";
import NewRole from "@/components/console/roles/NewRole";
import Steps from "@/components/console/roles/Steps";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage({ searchParams }: { searchParams: Promise<{ error?: string; manual?: string }> }) {
  const c = await requireCtx();
  assertCan(c, can.createRole);
  const sp = await searchParams;
  // With the AI connected, a new role starts as a conversation; the form stays for those who want it.
  if (aiConfigured() && sp.manual !== "1" && !sp.error) redirect("/console/chat?new=1");
  const past = await db
    .select({ id: roles.id, title: roles.title, closedAt: roles.closedAt })
    .from(roles)
    .where(and(visibleRoles(c)))
    .orderBy(desc(roles.createdAt))
    .limit(50);
  const { error } = sp;
  return (
    <div className="mx-auto max-w-[44rem]">
      <PageHeader title="New role" meta="What is the role? Winnow builds the rubric from it while you fill in the rest." />
      <Steps current={1} />
      {!aiConfigured() ? (
        <p className="mt-6 rounded-[10px] bg-caution/[0.07] px-3 py-2.5 text-[13.5px] text-caution">
          The AI is not connected yet, so the rubric will not be built until it is. You can still set the role up.
        </p>
      ) : null}
      <div className="mt-8">
        <NewRole action={createRole} past={past.map((p) => ({ ...p, closedAt: p.closedAt?.toISOString() ?? null }))} error={error} />
      </div>
    </div>
  );
}
