import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, auditLog, persons, roles, users } from "@/lib/db/schema";
import { can, visibleRoles, type Ctx } from "@/lib/console/context";

export const AUDIT_KINDS = {
  all: { label: "Everything", match: null },
  decisions: { label: "Decisions", match: ["decision.%", "stage.%"] },
  rubric: { label: "Rubric changes", match: ["rubric.%", "filter.%", "role.%"] },
  access: { label: "Data access", match: ["candidate.view", "export.%", "chat.%"] },
  people: { label: "Team and settings", match: ["member.%", "invite.%", "org.%", "integration.%", "reason.%", "brain.%"] },
  privacy: { label: "Privacy", match: ["rights.%", "person.%", "privacy.%"] },
} as const;
export type AuditKind = keyof typeof AUDIT_KINDS;

const VERB: Record<string, string> = {
  "decision.shortlisted": "Shortlisted",
  "decision.dropped": "Dropped",
  "decision.held": "Held",
  "decision.undo": "Undid a decision on",
  "stage.offer": "Moved to offer",
  "stage.hired": "Marked hired",
  "stage.joined": "Marked joined",
  "stage.interviewing": "Moved to interviewing",
  "candidate.view": "Opened",
  "rubric.save": "Changed the rubric",
  "rubric.restore": "Restored a rubric version",
  "rubric.review": "Reviewed the rubric",
  "role.create": "Created the role",
  "role.close": "Closed the role",
  "role.hold": "Put the role on hold",
  "role.reopen": "Reopened the role",
  "person.erase": "Deleted a candidate's records",
  "person.consent": "Changed consent",
};
export const describe = (action: string) => VERB[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (x) => x.toUpperCase());

export type AuditQuery = { kind: AuditKind; roleId: string | null; actorId: string | null; q: string; from: Date | null; to: Date | null; before: Date | null };

export function parseAudit(sp: Record<string, string | undefined>): AuditQuery {
  const date = (s?: string, end = false) => (s && !Number.isNaN(Date.parse(s)) ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}+05:30`) : null);
  return {
    kind: (sp.kind && sp.kind in AUDIT_KINDS ? sp.kind : "all") as AuditKind,
    roleId: sp.role && /^[0-9a-f-]{36}$/.test(sp.role) ? sp.role : null,
    actorId: sp.actor || null,
    q: (sp.q ?? "").trim().slice(0, 80),
    from: date(sp.from),
    to: date(sp.to, true),
    before: sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null,
  };
}

/** The immutable record, filtered. Hiring managers see only entries for roles they can see. */
export async function loadAudit(c: Ctx, f: AuditQuery, limit = 100) {
  const conds: (SQL | undefined)[] = [eq(auditLog.orgId, c.org.id)];
  const match = AUDIT_KINDS[f.kind].match;
  if (match) conds.push(or(...match.map((m) => (m.includes("%") ? sql`${auditLog.action} like ${m}` : eq(auditLog.action, m)))));
  if (f.roleId) conds.push(eq(auditLog.roleId, f.roleId));
  if (f.actorId) conds.push(eq(auditLog.actorId, f.actorId));
  if (f.from) conds.push(gte(auditLog.createdAt, f.from));
  if (f.to) conds.push(lte(auditLog.createdAt, f.to));
  if (f.before) conds.push(lt(auditLog.createdAt, f.before));
  if (f.q) conds.push(ilike(persons.name, `%${f.q}%`));
  if (!can.orgSettings(c)) {
    const visible = db.select({ id: roles.id }).from(roles).where(visibleRoles(c));
    conds.push(inArray(auditLog.roleId, visible));
  }
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      roleId: auditLog.roleId,
      role: roles.title,
      applicationId: auditLog.applicationId,
      candidate: persons.name,
      actor: users.name,
      actorEmail: users.email,
      version: auditLog.rubricVersion,
      detail: auditLog.detail,
    })
    .from(auditLog)
    .leftJoin(roles, eq(roles.id, auditLog.roleId))
    .leftJoin(applications, eq(applications.id, auditLog.applicationId))
    .leftJoin(persons, eq(persons.id, applications.personId))
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(...conds))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows;
}

export async function auditActors(c: Ctx) {
  return db
    .selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.orgId, c.org.id), sql`${auditLog.actorId} is not null`));
}

