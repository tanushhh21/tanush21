/**
 * Needs you: one queue across every role, sorted by what is blocking rather
 * than by date. Each item names the role, the person and the age, carries its
 * action, and can be dismissed with a reason. Item keys include the event's
 * time, so a new event of the same kind comes back after a dismissal.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  contradictions,
  debriefs,
  dismissals,
  evaluations,
  interviews,
  persons,
  questions,
  roles,
} from "@/lib/db/schema";
import { visibleRoles, type Ctx } from "./context";

export type NeedType =
  | "reply_unread"
  | "questions_drafted"
  | "shortlist_unseen"
  | "manager_holding"
  | "no_debrief"
  | "contradiction_unread"
  | "unanswered_twice"
  | "rubric_unreviewed"
  | "waiting_at_stage"
  | "role_quiet";

export type Need = {
  key: string;
  type: NeedType;
  roleId: string;
  roleTitle: string;
  person?: string;
  applicationId?: string;
  ageDays: number;
  text: string;
  action: { label: string; href: string };
};

/** Lower is more blocking. */
const PRIORITY: Record<NeedType, number> = {
  reply_unread: 0,
  questions_drafted: 1,
  shortlist_unseen: 2,
  manager_holding: 3,
  no_debrief: 4,
  contradiction_unread: 5,
  unanswered_twice: 6,
  rubric_unreviewed: 7,
  waiting_at_stage: 8,
  role_quiet: 9,
};

export const NEED_LABEL: Record<NeedType, string> = {
  reply_unread: "Candidate replied",
  questions_drafted: "Questions waiting to be sent",
  shortlist_unseen: "Manager has not opened the shortlist",
  manager_holding: "Manager is holding the shortlist",
  no_debrief: "Interview feedback missing",
  contradiction_unread: "CV contradicts itself",
  unanswered_twice: "No answer after two reminders",
  rubric_unreviewed: "Criteria never checked",
  waiting_at_stage: "Waiting too long",
  role_quiet: "No new candidates",
};

const DAY = 86_400_000;
const age = (d: Date | null | undefined) => (d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY)) : 0);
const stamp = (d: Date | null | undefined) => (d ? d.getTime().toString(36) : "0");

export async function needsYou(c: Ctx, opts: { includeDismissed?: boolean } = {}): Promise<Need[]> {
  const open = await db
    .select({ id: roles.id, title: roles.title, rubricVersion: roles.rubricVersion, rubricReviewedAt: roles.rubricReviewedAt, createdAt: roles.createdAt })
    .from(roles)
    .where(and(visibleRoles(c), eq(roles.state, "open")));
  if (open.length === 0) return [];
  const ids = open.map((r) => r.id);
  const title = new Map(open.map((r) => [r.id, r.title]));
  const items: Need[] = [];
  const base = (roleId: string) => `/console/roles/${roleId}`;

  // A candidate replied and nobody has read it.
  const replies = await db
    .select({ app: applications, name: persons.name })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(
      and(
        inArray(applications.roleId, ids),
        sql`${applications.lastReplyAt} is not null and (${applications.replyReadAt} is null or ${applications.replyReadAt} < ${applications.lastReplyAt})`,
      ),
    );
  for (const r of replies)
    items.push({
      key: `reply_unread:${r.app.id}:${stamp(r.app.lastReplyAt)}`,
      type: "reply_unread",
      roleId: r.app.roleId,
      roleTitle: title.get(r.app.roleId)!,
      person: r.name,
      applicationId: r.app.id,
      ageDays: age(r.app.lastReplyAt),
      text: `${r.name} replied`,
      action: { label: "Read reply", href: `/console/c/${r.app.id}#communication` },
    });

  // Questions drafted and waiting for approval to send (one item per role).
  const drafted = await db
    .select({ roleId: questions.roleId, n: sql<number>`count(distinct ${questions.applicationId})::int`, oldest: sql<Date>`min(${questions.createdAt})` })
    .from(questions)
    .where(and(inArray(questions.roleId, ids), eq(questions.status, "drafted")))
    .groupBy(questions.roleId);
  for (const d of drafted)
    items.push({
      key: `questions_drafted:${d.roleId}`,
      type: "questions_drafted",
      roleId: d.roleId,
      roleTitle: title.get(d.roleId)!,
      ageDays: age(new Date(d.oldest)),
      text: `Questions drafted for ${d.n} candidate${d.n === 1 ? "" : "s"}`,
      action: { label: "Review and send", href: `${base(d.roleId)}/verify` },
    });

  // A shortlist is ready and the hiring manager has not looked at it.
  const unseen = await db
    .select({ roleId: applications.roleId, n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${applications.decidedAt})` })
    .from(applications)
    .where(and(inArray(applications.roleId, ids), eq(applications.decision, "shortlisted"), isNull(applications.managerSeenAt)))
    .groupBy(applications.roleId);
  for (const u of unseen) {
    const days = age(new Date(u.oldest));
    const holding = days > 3;
    items.push({
      key: `${holding ? "manager_holding" : "shortlist_unseen"}:${u.roleId}`,
      type: holding ? "manager_holding" : "shortlist_unseen",
      roleId: u.roleId,
      roleTitle: title.get(u.roleId)!,
      ageDays: days,
      text: holding
        ? `The hiring manager has had ${u.n} shortlisted for ${days} days`
        : `${u.n} shortlisted, not yet looked at by the hiring manager`,
      action: { label: "Open shortlist", href: `${base(u.roleId)}?view=shortlisted` },
    });
  }

  // An interview happened and no debrief was recorded.
  const done = await db
    .select({ iv: interviews, name: persons.name })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .leftJoin(debriefs, eq(debriefs.interviewId, interviews.id))
    .where(and(inArray(interviews.roleId, ids), lt(interviews.endAt, new Date()), inArray(interviews.status, ["scheduled", "done"]), isNull(debriefs.id)));
  for (const d of done)
    items.push({
      key: `no_debrief:${d.iv.id}`,
      type: "no_debrief",
      roleId: d.iv.roleId,
      roleTitle: title.get(d.iv.roleId)!,
      person: d.name,
      applicationId: d.iv.applicationId,
      ageDays: age(d.iv.endAt),
      text: `How did the interview with ${d.name} go?`,
      action: { label: "Add feedback", href: `${base(d.iv.roleId)}/interviews?debrief=${d.iv.id}` },
    });

  // A contradiction was flagged and nobody has read it.
  const flags = await db
    .select({ cx: contradictions, roleId: applications.roleId, name: persons.name })
    .from(contradictions)
    .innerJoin(applications, eq(applications.id, contradictions.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(inArray(applications.roleId, ids), isNull(contradictions.readAt)));
  for (const f of flags)
    items.push({
      key: `contradiction_unread:${f.cx.id}`,
      type: "contradiction_unread",
      roleId: f.roleId,
      roleTitle: title.get(f.roleId)!,
      person: f.name,
      applicationId: f.cx.applicationId,
      ageDays: age(f.cx.createdAt),
      text: `${f.name}'s CV says two different things`,
      action: { label: "See both", href: `/console/c/${f.cx.applicationId}#contradictions` },
    });

  // A verification question went unanswered twice: close the candidate out.
  const silent = await db
    .select({ q: questions, name: persons.name })
    .from(questions)
    .innerJoin(applications, eq(applications.id, questions.applicationId))
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(inArray(questions.roleId, ids), eq(questions.status, "unanswered"), eq(applications.decision, "none")));
  const seenSilent = new Set<string>();
  for (const s of silent) {
    if (seenSilent.has(s.q.applicationId)) continue;
    seenSilent.add(s.q.applicationId);
    items.push({
      key: `unanswered_twice:${s.q.applicationId}`,
      type: "unanswered_twice",
      roleId: s.q.roleId,
      roleTitle: title.get(s.q.roleId)!,
      person: s.name,
      applicationId: s.q.applicationId,
      ageDays: age(s.q.lastFollowupAt ?? s.q.sentAt),
      text: `${s.name} did not answer after two follow-ups`,
      action: { label: "Decide", href: `/console/c/${s.q.applicationId}#decide` },
    });
  }

  // A rubric has never been reviewed on a role that has already been scored.
  const scored = await db
    .select({ roleId: evaluations.roleId, n: sql<number>`count(*)::int` })
    .from(evaluations)
    .where(and(inArray(evaluations.roleId, ids), eq(evaluations.status, "done")))
    .groupBy(evaluations.roleId);
  for (const s of scored) {
    const r = open.find((o) => o.id === s.roleId)!;
    if (r.rubricReviewedAt) continue;
    items.push({
      key: `rubric_unreviewed:${r.id}:v${r.rubricVersion}`,
      type: "rubric_unreviewed",
      roleId: r.id,
      roleTitle: r.title,
      ageDays: age(r.createdAt),
      text: `${s.n} scored on criteria nobody has checked yet`,
      action: { label: "Check criteria", href: `${base(r.id)}/rubric` },
    });
  }

  // A candidate has been waiting more than N days at a stage.
  const cutoff = new Date(Date.now() - c.org.staleDays * DAY);
  const waiting = await db
    .select({ app: applications, name: persons.name })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(
      and(
        inArray(applications.roleId, ids),
        inArray(applications.stage, ["shortlisted", "interviewing", "offer", "on_hold"]),
        lt(applications.stageChangedAt, cutoff),
      ),
    );
  for (const w of waiting)
    items.push({
      key: `waiting_at_stage:${w.app.id}:${w.app.stage}`,
      type: "waiting_at_stage",
      roleId: w.app.roleId,
      roleTitle: title.get(w.app.roleId)!,
      person: w.name,
      applicationId: w.app.id,
      ageDays: age(w.app.stageChangedAt),
      text: `${w.name} has been ${{ on_hold: "on hold", new: "waiting for a decision", screening: "waiting for a decision", shortlisted: "shortlisted", interviewing: "in interviews", offer: "waiting on an offer" }[w.app.stage as string] ?? w.app.stage} for ${age(w.app.stageChangedAt)} days`,
      action: { label: "Decide", href: `/console/c/${w.app.id}` },
    });

  // A role has had no new candidates for a week.
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const recent = await db
    .select({ roleId: applications.roleId, last: sql<Date>`max(${applications.createdAt})` })
    .from(applications)
    .where(inArray(applications.roleId, ids))
    .groupBy(applications.roleId);
  const lastBy = new Map(recent.map((r) => [r.roleId, new Date(r.last)]));
  for (const r of open) {
    if (r.createdAt > weekAgo) continue;
    const last = lastBy.get(r.id);
    if (last && last > weekAgo) continue;
    items.push({
      key: `role_quiet:${r.id}:${stamp(last)}`,
      type: "role_quiet",
      roleId: r.id,
      roleTitle: r.title,
      ageDays: age(last ?? r.createdAt),
      text: last ? `No new candidates in ${age(last)} days` : "No candidates yet",
      action: { label: "Add sources", href: `${base(r.id)}/settings#sources` },
    });
  }

  let out = items;
  if (!opts.includeDismissed && items.length) {
    const gone = await db
      .select({ key: dismissals.itemKey })
      .from(dismissals)
      .where(and(eq(dismissals.orgId, c.org.id), eq(dismissals.userId, c.user.id), inArray(dismissals.itemKey, items.map((i) => i.key))));
    const hidden = new Set(gone.map((g) => g.key));
    out = items.filter((i) => !hidden.has(i.key));
  }
  return out.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || b.ageDays - a.ageDays);
}

