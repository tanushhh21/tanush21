/**
 * Honest progress for a role: what is being read, scored, and what failed,
 * with counts. Polling it also keeps the queue moving.
 */
import { after, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, evaluations, jobs, roles } from "@/lib/db/schema";
import { requireCtx, requireRole } from "@/lib/console/context";
import { pump } from "@/lib/console/jobs";

export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const [q] = await db
    .select({
      parsing: sql<number>`count(*) filter (where ${jobs.kind} = 'parse' and ${jobs.status} in ('queued','running'))::int`,
      scoring: sql<number>`count(*) filter (where ${jobs.kind} in ('score','rescore') and ${jobs.status} in ('queued','running'))::int`,
      rubric: sql<number>`count(*) filter (where ${jobs.kind} = 'rubric' and ${jobs.status} in ('queued','running'))::int`,
      rubricFailed: sql<number>`count(*) filter (where ${jobs.kind} = 'rubric' and ${jobs.status} = 'failed')::int`,
    })
    .from(jobs)
    .where(eq(jobs.roleId, role.id));
  const [a] = await db
    .select({
      received: sql<number>`count(*)::int`,
      parsed: sql<number>`count(*) filter (where ${applications.parseStatus} = 'parsed')::int`,
      unreadable: sql<number>`count(*) filter (where ${applications.parseStatus} = 'unreadable')::int`,
    })
    .from(applications)
    .where(eq(applications.roleId, role.id));
  const [e] = await db
    .select({
      scored: sql<number>`count(*) filter (where ${evaluations.status} = 'done')::int`,
      failed: sql<number>`count(*) filter (where ${evaluations.status} = 'failed')::int`,
    })
    .from(evaluations)
    .where(and(eq(evaluations.roleId, role.id), eq(evaluations.rubricVersion, role.rubricVersion)));
  const fresh = await db.query.roles.findFirst({ where: eq(roles.id, role.id), columns: { rubricVersion: true, title: true } });
  const busy = q.parsing + q.scoring + q.rubric > 0;
  if (busy) after(() => pump(45_000));
  return NextResponse.json({ ...q, ...a, ...e, busy, version: fresh?.rubricVersion ?? 0, title: fresh?.title });
}
