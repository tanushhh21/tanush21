import type { Metadata } from "next";
import { requireCtx } from "@/lib/console/context";
import { NEED_LABEL, NEED_WHY, needsYou } from "@/lib/console/needs";
import Inbox from "@/components/console/inbox/Inbox";

export const metadata: Metadata = { title: "Needs you" };

/** Every open item across roles, as an inbox: the list on the left, the selected item and its action on the right. */
export default async function NeedsInbox({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const c = await requireCtx();
  const q = await searchParams;
  const needs = await needsYou(c);
  return (
    <Inbox
      initial={q.item ?? null}
      items={needs.map((n) => ({
        key: n.key,
        type: n.type,
        label: NEED_LABEL[n.type],
        why: NEED_WHY[n.type],
        roleTitle: n.roleTitle,
        roleId: n.roleId,
        person: n.person,
        ageDays: n.ageDays,
        text: n.text,
        action: n.action,
        priority: n.priority,
      }))}
    />
  );
}
