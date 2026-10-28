import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationFacts, chatMessages, refusedCriteria } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { loadRubric, versionHistory } from "@/lib/console/data/rubric";
import { loadRanking } from "@/lib/console/data/ranking";
import { versionEffects } from "@/lib/console/rubric";
import { currentRequirements } from "@/lib/console/scoring";
import { describe, excludedBy } from "@/lib/console/filters";
import { sendRoleChat } from "@/lib/console/actions/rubric";
import RubricEditor from "@/components/console/rubric/RubricEditor";
import Chat from "@/components/console/Chat";
import Waiter from "@/components/console/roles/Waiter";
import { Empty } from "@/components/console/ui";

export const metadata: Metadata = { title: "Rubric" };

export default async function RubricPage({ params }: { params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  if (role.rubricVersion === 0) {
    return (
      <Empty title="Building the rubric">
        It appears here as soon as Winnow has read the role.
        <Waiter roleId={role.id} until="rubric" />
      </Empty>
    );
  }
  const [rubric, history, effects, ranking, chat] = await Promise.all([
    loadRubric(role.id, role.rubricVersion),
    versionHistory(role.id),
    versionEffects(role.id),
    loadRanking(role.id, role.rubricVersion),
    db.select().from(chatMessages).where(and(eq(chatMessages.roleId, role.id), eq(chatMessages.orgId, c.org.id))).orderBy(asc(chatMessages.createdAt)).limit(100),
  ]);
  if (!rubric) return null;

  // Refused criteria across versions (a line refused in v1 stays visible).
  const versionIds = history.map((h) => h.v.id);
  const refused = versionIds.length ? await db.select().from(refusedCriteria).where(inArray(refusedCriteria.rubricVersionId, versionIds)) : [];
  const seen = new Set<string>();
  const refusedUnique = refused.filter((r) => !seen.has(r.line) && seen.add(r.line));

  // What each hard filter removes, and whether it removes anyone good.
  const scored = ranking.rows.filter((r) => r.status === "done");
  const top = Math.max(10, role.openings * 5);
  const cut = [...scored].filter((r) => r.rank != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[top - 1]?.score ?? -1;
  const facts = scored.length ? await db.select({ a: applicationFacts.applicationId, field: applicationFacts.field, value: applicationFacts.value, num: applicationFacts.num }).from(applicationFacts).where(inArray(applicationFacts.applicationId, scored.map((r) => r.id))) : [];
  const filters = rubric.filters.map((f) => {
    const out = scored.filter((r) => excludedBy(f, facts.filter((x) => x.a === r.id)));
    return { id: f.id, label: describe(f), active: f.active, excludes: out.length, aboveTop: cut >= 0 ? out.filter((r) => (r.score ?? 0) > cut).length : 0 };
  });

  const versions = await Promise.all(
    history.map(async (h) => {
      const reqs = await currentRequirements(role.id, h.v.version);
      const e = effects.find((x) => x.version === h.v.version);
      return {
        version: h.v.version,
        summary: h.v.summary,
        origin: h.v.origin,
        by: h.by,
        at: h.v.createdAt.toISOString(),
        entered: h.v.version > 1 ? e?.entered ?? [] : [],
        left: h.v.version > 1 ? e?.left ?? [] : [],
        requirements: reqs.map((q) => ({ text: q.text, weight: q.weight, mustHave: q.mustHave })),
      };
    }),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <RubricEditor
        roleId={role.id}
        items={rubric.requirements.map((q) => ({
          key: q.key,
          text: q.text,
          weight: q.weight,
          mustHave: q.mustHave,
          keywords: q.keywords,
          minYears: q.minYears,
          recencySensitive: q.recencySensitive,
          origin: q.origin,
          sourceSentence: q.sourceSentence,
        }))}
        refused={refusedUnique.map((r) => ({ id: r.id, line: r.line, reason: r.reason, kind: r.kind, addedAnyway: r.addedAnyway }))}
        filters={filters}
        versions={versions}
        candidates={scored.filter((r) => !r.filteredOut).map((r) => ({ id: r.id, name: r.name, verdicts: r.verdicts }))}
        canEdit={can.editRubric(c)}
        top={top}
      />
      <div className="xl:sticky xl:top-6 xl:self-start">
        <Chat
          title="Chat about this role"
          placeholder="Ask why someone ranks where they do, what the job description did not say, or what would happen if you dropped a requirement."
          messages={chat.map((m) => ({ id: m.id, author: m.author, body: m.body, diff: m.diff, diffState: m.diffState, at: m.createdAt.toISOString() }))}
          send={sendRoleChat.bind(null, role.id)}
          canApply={can.editRubric(c)}
        />
      </div>
    </div>
  );
}


