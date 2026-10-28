/**
 * The candidate detail: everything behind one ranking, so a recruiter (or a
 * rejected candidate, six months later) can see exactly why.
 */
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationFacts,
  applications,
  contradictions,
  debriefs,
  documents,
  evaluations,
  interviews,
  messages,
  notes,
  persons,
  questions,
  roles,
  users,
  verdicts,
} from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "@/lib/console/context";
import { arithmetic, currentRequirements } from "@/lib/console/scoring";
import { EXCLUDED, FACT_FIELDS } from "@/lib/ai/tasks";

export async function loadCandidate(c: Ctx, applicationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return null;
  const [row] = await db
    .select({ app: applications, person: persons, role: roles })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(eq(applications.id, applicationId), visibleRoles(c)));
  if (!row) return null;
  const { app, person, role } = row;
  const version = role.rubricVersion;

  const [reqs, evRow, docs, facts, flags, qs, msgs, noteRows, history, ivs] = await Promise.all([
    currentRequirements(role.id, version),
    db.query.evaluations.findFirst({ where: and(eq(evaluations.applicationId, app.id), eq(evaluations.rubricVersion, version)) }),
    db.select().from(documents).where(eq(documents.applicationId, app.id)).orderBy(desc(documents.createdAt)),
    db.select().from(applicationFacts).where(eq(applicationFacts.applicationId, app.id)),
    db.select().from(contradictions).where(eq(contradictions.applicationId, app.id)).orderBy(asc(contradictions.createdAt)),
    db.select().from(questions).where(eq(questions.applicationId, app.id)).orderBy(asc(questions.createdAt)),
    db.select({ m: messages, by: users.name }).from(messages).leftJoin(users, eq(users.id, messages.sentBy)).where(eq(messages.applicationId, app.id)).orderBy(asc(messages.createdAt)),
    db.select({ n: notes, by: users.name }).from(notes).leftJoin(users, eq(users.id, notes.authorId)).where(eq(notes.applicationId, app.id)).orderBy(asc(notes.createdAt)),
    db
      .select({ app: applications, title: roles.title, decidedBy: users.name })
      .from(applications)
      .innerJoin(roles, eq(roles.id, applications.roleId))
      .leftJoin(users, eq(users.id, applications.decidedBy))
      .where(and(eq(applications.personId, person.id), ne(applications.id, app.id)))
      .orderBy(desc(applications.appliedAt)),
    db.select({ iv: interviews, by: users.name }).from(interviews).leftJoin(users, eq(users.id, interviews.interviewerId)).where(eq(interviews.applicationId, app.id)).orderBy(asc(interviews.startAt)),
  ]);
  const vs = evRow ? await db.select().from(verdicts).where(eq(verdicts.evaluationId, evRow.id)) : [];
  const pastIds = history.map((h) => h.app.id);
  const pastDebriefs = pastIds.length
    ? await db.select({ d: debriefs, by: users.name }).from(debriefs).leftJoin(users, eq(users.id, debriefs.authorId)).where(inArray(debriefs.applicationId, pastIds))
    : [];
  const myDebriefs = ivs.length
    ? await db.select({ d: debriefs, by: users.name }).from(debriefs).leftJoin(users, eq(users.id, debriefs.authorId)).where(eq(debriefs.applicationId, app.id))
    : [];

  const cv = docs.find((d) => d.kind === "cv");
  const openFlags = flags.filter((f) => !f.resolvedAt).length;
  const math = arithmetic(reqs, vs, openFlags);
  const docName = new Map(docs.map((d) => [d.id, d.filename]));

  return {
    id: app.id,
    role: { id: role.id, title: role.title, version, hiringManagerId: role.hiringManagerId },
    person: { id: person.id, name: person.name, email: person.email, phone: person.phone, city: person.city, links: person.links, consent: person.consent },
    header: {
      rank: evRow?.rank ?? null,
      score: evRow?.status === "done" ? evRow.score : null,
      confidence: evRow?.confidence ?? null,
      band: evRow?.band ?? null,
      percentile: evRow?.percentile ?? null,
      source: app.source,
      referredBy: app.referredBy,
      appliedAt: app.appliedAt.toISOString(),
      stage: app.stage,
      stageChangedAt: app.stageChangedAt.toISOString(),
      decision: app.decision,
      reasonCode: app.reasonCode,
      decisionNote: app.decisionNote,
      status: app.parseStatus === "unreadable" ? "unreadable" : evRow?.status ?? (app.parseStatus === "pending" ? "reading" : "waiting"),
      problem: app.parseError ?? evRow?.error ?? null,
      strength: evRow?.reasonStrength ?? null,
      gap: evRow?.reasonGap ?? null,
      evidence: evRow?.evidenceStrength ?? null,
      filteredOut: evRow?.filteredOut ?? false,
      costUsd: evRow?.costUsd ?? 0,
      model: evRow?.model ?? null,
    },
    rubric: reqs.map((q) => {
      const v = vs.find((x) => x.requirementKey === q.key);
      return {
        key: q.key,
        text: q.text,
        weight: q.weight,
        mustHave: q.mustHave,
        verdict: v?.verdict ?? "unknown",
        quote: v?.quote ?? null,
        document: v?.documentId ? docName.get(v.documentId) ?? null : null,
        position: v?.position ?? null,
        retrievedAt: v?.retrievedAt?.toISOString() ?? null,
        support: v?.support ?? null,
        contribution: v?.contribution ?? 0,
        rationale: v?.rationale ?? null,
      };
    }),
    math: { earned: math.pointsEarned, available: math.pointsAvailable, total: math.pointsTotal, mustMet: math.mustMet, mustTotal: math.mustTotal, potential: Math.round(math.potential) },
    contradictions: flags.map((f) => ({
      id: f.id,
      kind: f.kind,
      quoteA: f.quoteA,
      sourceA: f.sourceA,
      quoteB: f.quoteB,
      sourceB: f.sourceB,
      read: Boolean(f.readAt),
      resolved: Boolean(f.resolvedAt),
      resolution: f.resolution,
    })),
    suggestions: evRow?.suggestions ?? [],
    questions: qs.map((q) => ({
      id: q.id,
      kind: q.kind,
      text: q.text,
      status: q.status,
      requirementKey: q.requirementKey,
      sentAt: q.sentAt?.toISOString() ?? null,
      followups: q.followups,
      answer: q.answer,
      answeredAt: q.answeredAt?.toISOString() ?? null,
      skipReason: q.skipReason,
    })),
    trail: {
      opened: docs.map((d) => ({ filename: d.filename, kind: d.kind, status: d.parseStatus, error: d.parseError, at: d.createdAt.toISOString() })),
      found: vs.filter((v) => v.verdict !== "unknown").length,
      notFound: reqs.filter((q) => (vs.find((v) => v.requirementKey === q.key)?.verdict ?? "unknown") === "unknown").map((q) => q.text),
    },
    excluded: { categories: EXCLUDED, removed: cv?.excluded ?? [] },
    facts: FACT_FIELDS.map((field) => {
      const f = facts.find((x) => x.field === field);
      return f ? { field, value: f.value, stated: f.stated, quote: f.quote } : { field, value: null, stated: false, quote: null };
    }),
    history: history.map((h) => ({
      id: h.app.id,
      role: h.title,
      appliedAt: h.app.appliedAt.toISOString(),
      decision: h.app.decision,
      reasonCode: h.app.reasonCode,
      decidedBy: h.decidedBy,
      debriefs: pastDebriefs.filter((d) => d.d.applicationId === h.app.id).map((d) => ({ by: d.by, wouldHire: d.d.wouldHire, strongest: d.d.strongest, concern: d.d.concern })),
    })),
    interviews: ivs.map((i) => ({ id: i.iv.id, title: i.iv.title, startAt: i.iv.startAt.toISOString(), status: i.iv.status, by: i.by })),
    debriefs: myDebriefs.map((d) => ({ by: d.by, wouldHire: d.d.wouldHire, strongest: d.d.strongest, concern: d.d.concern, at: d.d.createdAt.toISOString() })),
    messages: msgs.map((m) => ({ id: m.m.id, direction: m.m.direction, channel: m.m.channel, subject: m.m.subject, body: m.m.body, by: m.by, at: m.m.createdAt.toISOString() })),
    notes: noteRows.map((n) => ({ id: n.n.id, body: n.n.body, by: n.by, at: n.n.createdAt.toISOString() })),
    cvText: cv?.text ?? null,
  };
}

export type Candidate = NonNullable<Awaited<ReturnType<typeof loadCandidate>>>;
