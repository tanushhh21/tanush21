import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, availabilityLinks, debriefs, interviews, persons, users } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { teamFor } from "@/lib/console/team";
import InterviewBoard, { type Board } from "@/components/console/interviews/InterviewBoard";

export const metadata: Metadata = { title: "Interviews" };

export default async function Interviews({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ debrief?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const q = await searchParams;
  const apps = await db
    .select({ id: applications.id, stage: applications.stage, decision: applications.decision, name: persons.name, email: persons.email })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(eq(applications.roleId, role.id), inArray(applications.stage, ["shortlisted", "interviewing", "offer", "hired"])));
  const shortlisted = await db
    .select({ id: applications.id, stage: applications.stage, decision: applications.decision, name: persons.name, email: persons.email })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .where(and(eq(applications.roleId, role.id), eq(applications.decision, "shortlisted")));
  const people = new Map([...apps, ...shortlisted].map((a) => [a.id, a]));
  const ivs = await db.select().from(interviews).where(eq(interviews.roleId, role.id)).orderBy(interviews.startAt);
  const links = await db.select().from(availabilityLinks).where(and(eq(availabilityLinks.roleId, role.id), eq(availabilityLinks.status, "sent"))).orderBy(desc(availabilityLinks.createdAt));
  const dbs = ivs.length
    ? await db
        .select({ d: debriefs, author: users.name })
        .from(debriefs)
        .leftJoin(users, eq(users.id, debriefs.authorId))
        .where(inArray(debriefs.interviewId, ivs.map((i) => i.id)))
    : [];
  const team = await teamFor(c.org.id);
  // An operator working on a customer's role is not a member, but can still interview.
  if (!team.some((t) => t.id === c.user.id)) team.push({ id: c.user.id, name: c.user.name ?? null, email: c.user.email ?? null, access: "ta" as const });
  const nameOf = (id: string | null) => team.find((t) => t.id === id)?.name ?? team.find((t) => t.id === id)?.email ?? null;
  const now = Date.now();

  const board: Board = {
    roleId: role.id,
    now,
    me: c.user.id,
    canSchedule: can.manageSources(c) || c.user.id === role.hiringManagerId,
    team: team.map((t) => ({ id: t.id, name: t.name ?? t.email ?? "Unnamed" })),
    defaultInterviewer: role.hiringManagerId,
    focus: q.debrief ?? null,
    interviews: ivs
      .filter((i) => people.has(i.applicationId))
      .map((i) => ({
        id: i.id,
        applicationId: i.applicationId,
        name: people.get(i.applicationId)!.name,
        interviewer: nameOf(i.interviewerId),
        interviewerId: i.interviewerId,
        start: i.startAt.toISOString(),
        end: i.endAt.toISOString(),
        status: i.status,
        reschedules: i.reschedules,
        debriefs: dbs.filter((d) => d.d.interviewId === i.id).map((d) => ({ by: d.author ?? "Someone", wouldHire: d.d.wouldHire, strongest: d.d.strongest, concern: d.d.concern, at: d.d.createdAt.toISOString() })),
      })),
    waiting: links
      .filter((l) => people.has(l.applicationId))
      .map((l) => ({ id: l.id, applicationId: l.applicationId, name: people.get(l.applicationId)!.name, sentAt: l.createdAt.toISOString(), slots: l.slots.length, expired: l.slots.every((s) => new Date(s.start).getTime() < now) })),
    candidates: [...people.values()].map((p) => ({ id: p.id, name: p.name, stage: p.stage, hasEmail: Boolean(p.email) })),
  };
  return <InterviewBoard board={board} />;
}
