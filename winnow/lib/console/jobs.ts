/**
 * Background work: reading CVs, scoring, building rubrics, re-scoring after an
 * edit. Jobs live in the database and are claimed with SKIP LOCKED, so any
 * number of requests can pump the queue safely. The pump runs after uploads
 * (via after()) and whenever an open role page polls for progress.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, rowsOf } from "@/lib/db";
import {
  applicationFacts,
  applications,
  contradictions,
  documents,
  evaluations,
  hardFilters,
  jobs,
  mergeCandidates,
  observations,
  personIdentities,
  persons,
  refusedCriteria,
  requirements,
  roles,
  rubricVersions,
  verdicts,
  type JobKind,
} from "@/lib/db/schema";
import { AiError, aiConfigured } from "@/lib/ai/claude";
import { evaluate, readApplication, readApplicationPdf, readRole, redact, type RubricForAi } from "@/lib/ai/tasks";
import { extract } from "./parse";
import { readStoredFile } from "./storage";
import { arithmetic, currentRequirements, rankRole } from "./scoring";
import { logActivity } from "./log";
import { notifyRole } from "./notify";
import { touchRole } from "./roles";
import { applyHardFilters } from "./filters";
import { companyContext } from "./brain";

const MAX_ATTEMPTS = 3;

export async function enqueue(kind: JobKind, o: { orgId: string; roleId?: string | null; payload?: Record<string, unknown> }) {
  await db.insert(jobs).values({ kind, orgId: o.orgId, roleId: o.roleId ?? null, payload: o.payload ?? {} });
}

export async function enqueueMany(kind: JobKind, list: { orgId: string; roleId?: string | null; payload?: Record<string, unknown> }[]) {
  if (list.length) await db.insert(jobs).values(list.map((o) => ({ kind, orgId: o.orgId, roleId: o.roleId ?? null, payload: o.payload ?? {} })));
}

async function claim(n: number) {
  const rows = await db.execute(sql`
    update ${jobs} set status = 'running', attempts = ${jobs.attempts} + 1, locked_until = now() + interval '3 minutes', updated_at = now()
    where ${jobs.id} in (
      select ${jobs.id} from ${jobs}
      where ${jobs.status} = 'queued' or (${jobs.status} = 'running' and ${jobs.lockedUntil} < now())
      order by ${jobs.createdAt}
      limit ${n}
      for update skip locked
    )
    returning *`);
  return rowsOf(rows).map((r) => ({
    id: String(r.id),
    kind: r.kind as JobKind,
    orgId: r.org_id as string | null,
    roleId: r.role_id as string | null,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    attempts: Number(r.attempts),
  }));
}

type Job = Awaited<ReturnType<typeof claim>>[number];

/** Works through the queue until it is empty or the time budget runs out. */
export async function pump(budgetMs = 40_000, concurrency = 4) {
  const until = Date.now() + budgetMs;
  let done = 0;
  while (Date.now() < until) {
    const batch = await claim(concurrency);
    if (batch.length === 0) break;
    await Promise.all(batch.map(run));
    done += batch.length;
  }
  return done;
}

async function run(job: Job) {
  try {
    if (job.kind === "parse") await parseJob(job);
    else if (job.kind === "score") await scoreJob(job);
    else if (job.kind === "rubric") await rubricJob(job);
    else if (job.kind === "rescore") await rescoreJob(job);
    await db.update(jobs).set({ status: "done", updatedAt: new Date(), error: null }).where(eq(jobs.id, job.id));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Retry transient failures; a missing key or a decline will not fix itself.
    const permanent = e instanceof AiError && (e.kind === "not_configured" || e.kind === "refusal" || e.kind === "unsupported");
    const failed = permanent || job.attempts >= MAX_ATTEMPTS;
    await db
      .update(jobs)
      .set({ status: failed ? "failed" : "queued", error: message.slice(0, 500), updatedAt: new Date(), lockedUntil: null })
      .where(eq(jobs.id, job.id));
    if (failed) await onFailure(job, message);
  }
}

async function onFailure(job: Job, message: string) {
  const applicationId = job.payload.applicationId as string | undefined;
  if (job.kind === "score" && applicationId) {
    await db
      .update(evaluations)
      .set({ status: "failed", error: message.slice(0, 300) })
      .where(and(eq(evaluations.applicationId, applicationId), eq(evaluations.rubricVersion, Number(job.payload.version))));
  }
  if (job.kind === "parse" && applicationId) {
    await db.update(applications).set({ parseStatus: "unreadable", parseError: message.slice(0, 300) }).where(eq(applications.id, applicationId));
  }
  if (job.orgId)
    await logActivity({
      orgId: job.orgId,
      roleId: job.roleId,
      kind: `${job.kind}_failed`,
      message: job.kind === "rubric" ? `Could not build the rubric: ${message}` : `${job.kind === "parse" ? "Reading" : "Scoring"} failed: ${message}`,
      detail: { applicationId },
    });
  if (job.roleId && (job.kind === "score" || job.kind === "rescore" || job.kind === "rubric"))
    await notifyRole(job.roleId, "scoring_failed", job.kind === "rubric" ? "The rubric could not be built" : "Scoring failed for some candidates", `/console/roles/${job.roleId}/activity?show=failures`);
  if (job.roleId) await drainCheck(job.roleId);
}

// ---- Reading a CV ----------------------------------------------------------------

async function parseJob(job: Job) {
  const applicationId = String(job.payload.applicationId);
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, String(job.payload.documentId)) });
  const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!doc || !app) return;
  if (!aiConfigured()) throw new AiError("The AI is not set up yet (add GROQ_API_KEY or ANTHROPIC_API_KEY).", "not_configured");

  const data = await readStoredFile(doc.url!);
  const parsed = await extract(doc.filename, data);
  if (!parsed.ok) {
    await db.update(documents).set({ parseStatus: "unreadable", parseError: parsed.reason }).where(eq(documents.id, doc.id));
    await db.update(applications).set({ parseStatus: "unreadable", parseError: parsed.reason }).where(eq(applications.id, app.id));
    await logActivity({ orgId: app.orgId, roleId: app.roleId, kind: "parse_failure", message: `Could not read ${doc.filename}: ${parsed.reason}`, detail: { applicationId: app.id, filename: doc.filename } });
    await drainCheck(app.roleId);
    return;
  }

  const read = parsed.scanned && doc.mime === "application/pdf" ? await readApplicationPdf(data.toString("base64")) : await readApplication(parsed.text);
  const r = read.data;
  if (!r.readable) {
    const reason = "The file does not look like a CV.";
    await db.update(documents).set({ parseStatus: "unreadable", parseError: reason, text: parsed.text }).where(eq(documents.id, doc.id));
    await db.update(applications).set({ parseStatus: "unreadable", parseError: reason }).where(eq(applications.id, app.id));
    await logActivity({ orgId: app.orgId, roleId: app.roleId, kind: "parse_failure", message: `Could not read ${doc.filename}: ${reason}`, costUsd: read.costUsd });
    await drainCheck(app.roleId);
    return;
  }

  await db
    .update(documents)
    .set({ parseStatus: "parsed", text: parsed.text || null, excluded: r.excluded_quotes })
    .where(eq(documents.id, doc.id));

  await db
    .update(applications)
    .set({ protectedAttrs: { gender: r.protected_attributes?.gender ?? null, birthYear: r.protected_attributes?.birth_year ?? null } })
    .where(eq(applications.id, app.id));

  // Facts read off the application, each stated or inferred, with its quote.
  await db.delete(applicationFacts).where(eq(applicationFacts.applicationId, app.id));
  const seen = new Set<string>();
  const facts = r.facts.filter((f) => !seen.has(f.field) && seen.add(f.field));
  if (facts.length)
    await db.insert(applicationFacts).values(
      facts.map((f) => ({ applicationId: app.id, field: f.field, value: f.value.slice(0, 300), num: f.number, stated: f.stated, quote: f.quote?.slice(0, 400) ?? null, documentId: doc.id })),
    );
  await db.delete(contradictions).where(and(eq(contradictions.applicationId, app.id), sql`${contradictions.resolvedAt} is null`));
  if (r.contradictions.length)
    await db.insert(contradictions).values(
      r.contradictions.map((c) => ({ applicationId: app.id, kind: c.kind, quoteA: c.quote_a, sourceA: doc.filename, quoteB: c.quote_b, sourceB: doc.filename })),
    );
  if (r.contradictions.length) await notifyRole(app.roleId, "contradiction", `Contradiction flagged on ${r.name || "a candidate"}`, `/console/c/${app.id}#contradictions`);

  // Linking to the person graph runs one at a time per company, so two CVs from
  // the same person read at the same moment still end up as one person.
  const { personId, duplicate } = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${app.orgId}))`);
    const personId = await linkPerson(tx as unknown as typeof db, app, r, facts.find((f) => f.field === "city")?.value ?? null);
    await tx.update(applications).set({ parseStatus: "parsed", parseError: null, personId }).where(eq(applications.id, app.id));
    // A second application from the same person to the same role is a duplicate: keep the first.
    const same = await tx
      .select({ id: applications.id, createdAt: applications.createdAt })
      .from(applications)
      .where(and(eq(applications.roleId, app.roleId), eq(applications.personId, personId), sql`coalesce(${applications.reasonCode}, '') <> 'duplicate'`))
      .orderBy(applications.createdAt, applications.id);
    const later = same.slice(1).map((x) => x.id);
    if (later.length)
      await tx
        .update(applications)
        .set({ decision: "dropped", stage: "dropped", reasonCode: "duplicate", decisionNote: "Same person already applied to this role.", decidedAt: new Date(), stageChangedAt: new Date() })
        .where(inArray(applications.id, later));
    return { personId, duplicate: later.includes(app.id) };
  });
  await logActivity({ orgId: app.orgId, roleId: app.roleId, kind: "parsed", message: `Read ${doc.filename}`, costUsd: read.costUsd, detail: { applicationId: app.id, personId } });
  if (duplicate) {
    await drainCheck(app.roleId);
    return;
  }

  const role = await db.query.roles.findFirst({ where: eq(roles.id, app.roleId) });
  if (role && role.rubricVersion > 0) await enqueue("score", { orgId: app.orgId, roleId: app.roleId, payload: { applicationId: app.id, version: role.rubricVersion } });
  else await drainCheck(app.roleId);
}

/**
 * The person graph: one record per person per company. An exact email or phone
 * match is the same person (so their history with this company follows them);
 * a same-name match is only suggested, for a human to merge.
 */
async function linkPerson(
  db: typeof import("@/lib/db").db,
  app: typeof applications.$inferSelect,
  r: { name: string; email: string | null; phone: string | null; links: string[] },
  city: string | null,
) {
  const email = r.email?.trim().toLowerCase() || null;
  const phone = r.phone ? r.phone.replace(/\D/g, "").slice(-10) : null;
  const ids = [email && { kind: "email" as const, value: email }, phone && { kind: "phone" as const, value: phone }].filter(Boolean) as { kind: "email" | "phone"; value: string }[];

  let existing: string | null = null;
  for (const id of ids) {
    const hit = await db
      .select({ personId: personIdentities.personId })
      .from(personIdentities)
      .innerJoin(persons, eq(persons.id, personIdentities.personId))
      .where(and(eq(persons.orgId, app.orgId), eq(personIdentities.kind, id.kind), eq(personIdentities.value, id.value), ne(persons.id, app.personId), sql`${persons.mergedInto} is null`))
      .limit(1);
    if (hit[0]) {
      existing = hit[0].personId;
      break;
    }
  }

  if (existing) {
    const placeholder = app.personId;
    await db.update(applications).set({ personId: existing }).where(eq(applications.personId, placeholder));
    await db.update(documents).set({ personId: existing }).where(eq(documents.personId, placeholder));
    await db.delete(persons).where(eq(persons.id, placeholder));
    return existing;
  }

  await db
    .update(persons)
    .set({ name: r.name.slice(0, 120), email, phone: r.phone, city, links: r.links.slice(0, 10) })
    .where(eq(persons.id, app.personId));
  if (ids.length) await db.insert(personIdentities).values(ids.map((i) => ({ personId: app.personId, ...i })));

  const sameName = await db
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.orgId, app.orgId), sql`lower(${persons.name}) = lower(${r.name})`, ne(persons.id, app.personId), sql`${persons.mergedInto} is null`))
    .limit(3);
  if (sameName.length)
    await db.insert(mergeCandidates).values(
      sameName.map((p) => ({ orgId: app.orgId, personA: p.id, personB: app.personId, confidence: 0.55, reason: "Same name, different contact details." })),
    );
  return app.personId;
}

// ---- Scoring ------------------------------------------------------------------------

async function scoreJob(job: Job) {
  const applicationId = String(job.payload.applicationId);
  const version = Number(job.payload.version);
  const only = (job.payload.only as string[] | undefined) ?? null;
  const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  const role = app && (await db.query.roles.findFirst({ where: eq(roles.id, app.roleId) }));
  if (!app || !role) return;
  const reqs = await currentRequirements(role.id, version);
  if (reqs.length === 0) return;
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.applicationId, app.id), eq(documents.kind, "cv")), orderBy: (d, { desc }) => [desc(d.createdAt)] });
  const person = await db.query.persons.findFirst({ where: eq(persons.id, app.personId) });
  if (!doc?.text) throw new Error("No readable CV text to score.");

  let [ev] = await db
    .insert(evaluations)
    .values({ applicationId: app.id, roleId: role.id, rubricVersion: version, status: "scoring" })
    .onConflictDoUpdate({ target: [evaluations.applicationId, evaluations.rubricVersion], set: { status: "scoring", error: null } })
    .returning();

  const forAi: RubricForAi = reqs
    .filter((q) => !only || only.includes(q.key))
    .map((q) => ({ key: q.key, text: q.text, weight: q.weight, mustHave: q.mustHave, keywords: q.keywords, minYears: q.minYears, recencySensitive: q.recencySensitive }));
  const text = redact(doc.text, doc.excluded, person?.name ?? "");
  const out = await evaluate(forAi, text, role.title);
  const result = out.data;

  if (!only) await db.delete(verdicts).where(eq(verdicts.evaluationId, ev.id));
  else await db.delete(verdicts).where(and(eq(verdicts.evaluationId, ev.id), inArray(verdicts.requirementKey, only)));
  const valid = new Set(forAi.map((q) => q.key));
  // Evidence must be real: a "met" or "partly" whose quote is not in the CV
  // (a model slip, or a CV trying to instruct the model) counts as unknown.
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const hay = norm(text);
  const fresh = result.verdicts
    .filter((v) => valid.has(v.key))
    .map((v) =>
      (v.verdict === "met" || v.verdict === "partial") && (!v.quote || !hay.includes(norm(v.quote)))
        ? { ...v, verdict: "unknown" as const, quote: null, rationale: `Not counted: the quoted evidence is not in the CV. ${v.rationale}` }
        : v,
    );
  if (fresh.length)
    await db.insert(verdicts).values(
      fresh.map((v) => ({
        evaluationId: ev.id,
        requirementKey: v.key,
        verdict: v.verdict,
        quote: v.quote?.slice(0, 400) ?? null,
        documentId: doc.id,
        position: v.quote ? doc.text!.indexOf(v.quote) : null,
        retrievedAt: new Date(),
        support: v.support,
        rationale: v.rationale.slice(0, 400),
      })),
    );
  [ev] = await db
    .update(evaluations)
    .set({
      status: "done",
      reasonStrength: only ? ev.reasonStrength ?? result.strongest : result.strongest,
      reasonGap: only ? ev.reasonGap ?? result.sharpest_gap : result.sharpest_gap,
      evidenceStrength: result.evidence_strength,
      suggestions: result.questions.map((q) => ({ requirementKey: q.requirement_key, text: q.text })),
      costUsd: sql`${evaluations.costUsd} + ${out.costUsd}`,
      model: out.model,
      scoredAt: new Date(),
    })
    .where(eq(evaluations.id, ev.id))
    .returning();
  await applyHardFilters(role.id, [app.id], version);
  if (job.payload.cause === "answer") {
    const now = await db.select().from(verdicts).where(eq(verdicts.evaluationId, ev.id));
    const after = arithmetic(reqs, now).score;
    const before = job.payload.before as number | null;
    await db.insert(observations).values({ orgId: app.orgId, kind: "verification", personId: app.personId, applicationId: app.id, roleId: role.id, payload: { cause: "answer", scoreBefore: before, scoreAfter: after } });
    await logActivity({
      orgId: app.orgId,
      roleId: role.id,
      kind: "rescored_after_answer",
      message: before == null || before === after ? `${person?.name ?? "A candidate"}'s answer was read; the score is unchanged at ${after}` : `${person?.name ?? "A candidate"}'s score moved from ${before} to ${after} after their answer`,
      costUsd: out.costUsd,
      detail: { applicationId: app.id, before, after },
    });
  } else {
    await logActivity({ orgId: app.orgId, roleId: role.id, kind: "scored", message: `Scored ${person?.name ?? "a candidate"} against rubric v${version}`, costUsd: out.costUsd, detail: { applicationId: app.id } });
  }
  await drainCheck(role.id);
}

/** When a role's queue empties, rank everyone and record the batch. */
async function drainCheck(roleId: string) {
  const [left] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.roleId, roleId), inArray(jobs.status, ["queued", "running"]), inArray(jobs.kind, ["parse", "score", "rescore", "rubric"])));
  // This job itself is still "running" while we check.
  if ((left?.n ?? 0) > 1) return;
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return;
  if (role.rubricVersion > 0) await rankRole(roleId, role.rubricVersion);
  await touchRole(roleId);
}

// ---- Rubric -----------------------------------------------------------------------------

async function rubricJob(job: Job) {
  const roleId = String(job.payload.roleId);
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role || role.rubricVersion > 0) return;
  const brief = [role.jdText, role.intakeNotes].filter(Boolean).join("\n\n");
  const out = await readRole(brief || role.title, await companyContext(role.orgId));
  const r = out.data;
  await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(rubricVersions)
      .values({ roleId, version: 1, origin: "initial", summary: "Built from the job description", createdBy: null })
      .returning();
    if (r.requirements.length)
      await tx.insert(requirements).values(
        r.requirements.map((q, i) => ({
          rubricVersionId: v.id,
          key: crypto.randomUUID().slice(0, 8),
          position: i,
          text: q.text,
          weight: Math.min(5, Math.max(1, q.weight)),
          mustHave: q.must_have,
          sourceSentence: q.source_sentence ?? q.why_added,
          origin: q.origin,
          keywords: q.keywords.slice(0, 8),
          minYears: q.min_years,
          recencySensitive: q.recency_sensitive,
        })),
      );
    if (r.refused.length)
      await tx.insert(refusedCriteria).values(
        r.refused.map((x) => ({ rubricVersionId: v.id, line: x.line, kind: x.kind, reason: x.underlying_question ? `${x.reason} Ask instead: ${x.underlying_question}` : x.reason })),
      );
    for (const f of r.hard_filters) {
      const numeric = ["notice_period_days", "expected_ctc", "years_experience"].includes(f.field);
      const value = f.op === "in" ? f.value.split(",").map((s) => s.trim()) : numeric ? Number(f.value.replace(/[^\d.]/g, "")) : f.value;
      if (numeric && Number.isNaN(value)) continue;
      // Suggested, not active: a filter removes people, so a human switches it on.
      await tx.insert(hardFilters).values({ roleId, field: f.field, op: f.op, value, active: false });
    }
    await tx
      .update(roles)
      .set({
        rubricVersion: 1,
        title: role.title === "New role" ? r.title.slice(0, 120) : role.title,
        family: role.family ?? r.family,
        locations: role.locations.length ? role.locations : r.locations,
        intakeNotes: [role.intakeNotes, r.unsaid.length ? `Not said in the brief:\n${r.unsaid.map((u) => `- ${u}`).join("\n")}` : null].filter(Boolean).join("\n\n") || null,
        lastChangeAt: new Date(),
      })
      .where(eq(roles.id, roleId));
  });
  await logActivity({ orgId: role.orgId, roleId, kind: "rubric_built", message: `Built the rubric: ${r.requirements.length} requirements, ${r.refused.length} criteria refused`, costUsd: out.costUsd });

  const ready = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.roleId, roleId), eq(applications.parseStatus, "parsed"), eq(applications.decision, "none")));
  await enqueueMany("score", ready.map((a) => ({ orgId: role.orgId, roleId, payload: { applicationId: a.id, version: 1 } })));
}

/**
 * After a rubric edit: weight and must-have changes need only arithmetic, so
 * verdicts are carried over; requirements whose meaning changed are re-read.
 * Old versions' scores are kept.
 */
async function rescoreJob(job: Job) {
  const roleId = String(job.payload.roleId);
  const version = Number(job.payload.version);
  const changed = (job.payload.changed as string[]) ?? [];
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return;
  const from = version - 1;
  const prior = await db
    .select({ ev: evaluations })
    .from(evaluations)
    .innerJoin(applications, eq(applications.id, evaluations.applicationId))
    .where(and(eq(evaluations.roleId, roleId), eq(evaluations.rubricVersion, from), eq(evaluations.status, "done")));
  const reqs = await currentRequirements(roleId, version);
  const keys = new Set(reqs.map((q) => q.key));
  const needModel = new Set(changed.filter((k) => keys.has(k)));

  for (const { ev } of prior) {
    const [copy] = await db
      .insert(evaluations)
      .values({
        applicationId: ev.applicationId,
        roleId,
        rubricVersion: version,
        status: "done",
        reasonStrength: ev.reasonStrength,
        reasonGap: ev.reasonGap,
        evidenceStrength: ev.evidenceStrength,
        suggestions: ev.suggestions,
        model: ev.model,
        scoredAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!copy) continue;
    const old = await db.select().from(verdicts).where(eq(verdicts.evaluationId, ev.id));
    const carry = old.filter((v) => keys.has(v.requirementKey) && !needModel.has(v.requirementKey));
    if (carry.length)
      await db.insert(verdicts).values(
        carry.map((v) => ({
          evaluationId: copy.id,
          requirementKey: v.requirementKey,
          verdict: v.verdict,
          quote: v.quote,
          documentId: v.documentId,
          position: v.position,
          retrievedAt: v.retrievedAt,
          support: v.support,
          rationale: v.rationale,
        })),
      );
    if (needModel.size) await enqueue("score", { orgId: role.orgId, roleId, payload: { applicationId: ev.applicationId, version, only: [...needModel] } });
  }
  await applyHardFilters(roleId, prior.map((p) => p.ev.applicationId), version);
  if (!needModel.size) await drainCheck(roleId);
}
