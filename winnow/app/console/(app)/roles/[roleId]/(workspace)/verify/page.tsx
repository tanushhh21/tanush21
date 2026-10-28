import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgs, questions } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { loadRanking } from "@/lib/console/data/ranking";
import { arithmetic, placesAtStake } from "@/lib/console/arith";
import { FOLLOWUP_DAYS } from "@/lib/console/questions";
import VerifyList, { type Work } from "@/components/console/verify/VerifyList";
import { Empty } from "@/components/console/ui";

export const metadata: Metadata = { title: "Verify" };

export default async function Verify({ params }: { params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const { requirements, rows } = await loadRanking(role.id, role.rubricVersion);
  const reqs = requirements.map((r) => ({ key: r.key, weight: r.weight, mustHave: r.mustHave, text: r.text }));
  const scored = rows.filter((r) => r.status === "done" && !r.filteredOut && r.decision !== "dropped");
  const maths = new Map(
    scored.map((r) => [r.id, arithmetic(reqs, Object.entries(r.verdicts).map(([requirementKey, verdict]) => ({ requirementKey, verdict, support: null })), r.contradictions)]),
  );
  const stakes = placesAtStake(scored.map((r) => ({ id: r.id, standing: maths.get(r.id)!.standing, potential: maths.get(r.id)!.potential })));
  const ids = scored.map((r) => r.id);
  const qs = ids.length ? await db.select().from(questions).where(inArray(questions.applicationId, ids)) : [];
  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) });
  const near = Math.max(10, role.openings * 5);

  const work: Work[] = scored
    .map((r) => {
      const s = stakes.get(r.id)!;
      const unknown = requirements.filter((q) => (r.verdicts[q.key] ?? "unknown") === "unknown" || r.verdicts[q.key] === "partial");
      const mine = qs.filter((q) => q.applicationId === r.id);
      const sent = mine.filter((q) => q.status === "sent");
      const last = sent.sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))[0];
      let state = "Not asked yet";
      if (mine.some((q) => q.status === "skipped")) state = `Skipped: ${mine.find((q) => q.status === "skipped")!.skipReason}`;
      else if (mine.some((q) => q.status === "unanswered")) state = "Stopped after two follow-ups, no answer";
      else if (mine.some((q) => q.status === "answered")) state = "Answered";
      else if (last) {
        const days = Math.floor((Date.now() - (last.sentAt?.getTime() ?? Date.now())) / 86_400_000);
        const next = FOLLOWUP_DAYS[last.followups];
        state = `Sent ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}${last.followups ? `, ${last.followups} of 2 follow-ups` : ""}${next != null ? `, next follow-up in ${Math.max(0, next - days)} day${next - days === 1 ? "" : "s"}` : ""}`;
      } else if (mine.some((q) => q.status === "drafted")) state = "Drafted, waiting to be sent";
      else if (mine.some((q) => q.status === "asked_outside")) state = "Asked outside Winnow";
      return {
        id: r.id,
        name: r.name,
        rank: s.now,
        could: s.could,
        stake: s.stake,
        band: r.band,
        unverified: [
          ...unknown.map((q) => ({ text: q.text, why: `${q.mustHave ? "Must-have" : `Weight ${q.weight}`}, ${r.verdicts[q.key] === "partial" ? "only partly shown" : "not shown"}` })),
          ...(r.contradictions ? [{ text: `${r.contradictions} contradiction${r.contradictions === 1 ? "" : "s"} in the CV`, why: "Keeps them out of Verified until resolved" }] : []),
        ],
        questions: r.suggestions.slice(0, 3),
        drafted: mine.filter((q) => q.status === "drafted").map((q) => ({ id: q.id, text: q.text })),
        state,
        done: mine.some((q) => ["answered", "unanswered", "skipped", "asked_outside"].includes(q.status)),
      };
    })
    .filter((w) => w.unverified.length && (w.stake > 0 || (w.rank <= near && w.band === "needs_verification")))
    .sort((a, b) => b.stake - a.stake || a.rank - b.rank);

  if (role.rubricVersion === 0) return <Empty title="Nothing to verify yet">The worklist fills once candidates are scored.</Empty>;
  return <VerifyList roleId={role.id} work={work} canAsk={can.sendQuestions(c)} sender={role.questionSender ?? org?.questionSender ?? "winnow"} orgName={c.org.name} />;
}
