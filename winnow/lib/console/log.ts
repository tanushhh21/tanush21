/**
 * The two records of what happened. The audit log is the immutable legal
 * record (every decision, rubric change and data access). Activity is the
 * readable story of a role, including what Winnow's own work cost.
 */
import { db } from "@/lib/db";
import { activity, auditLog } from "@/lib/db/schema";

export async function audit(e: {
  orgId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  roleId?: string | null;
  applicationId?: string | null;
  rubricVersion?: number | null;
  detail?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({ ...e, detail: e.detail ?? {} });
}

export async function logActivity(e: {
  orgId: string;
  roleId?: string | null;
  kind: string;
  message: string;
  detail?: Record<string, unknown>;
  costUsd?: number;
  actorId?: string | null;
}) {
  await db.insert(activity).values({ ...e, detail: e.detail ?? {}, costUsd: e.costUsd ?? 0 });
}
