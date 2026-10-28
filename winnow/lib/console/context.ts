/**
 * Who is signed in, which organisation they are working in, and what they may
 * do there. Every console page and server action goes through requireCtx().
 *
 * Four kinds of user see the same screens with different write access:
 *   hiring manager: their own roles; decides on candidates; reads everything
 *   TA:             all roles; edits rubrics, sends questions, creates roles
 *   admin:          plus team, integrations, data settings, billing
 *   operator:       Winnow staff; every customer, plus the operator console
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberships, orgs, roleAccess, roles, users, type Access } from "@/lib/db/schema";

export const ORG_COOKIE = "winnow_org";

export type Level = Access | "operator";

export type Ctx = {
  user: { id: string; name: string; email: string; image: string | null; isOperator: boolean };
  org: typeof orgs.$inferSelect;
  level: Level;
  /** A hiring manager limited to named roles. */
  restricted: boolean;
  orgs: { id: string; name: string; level: Level }[];
};

export const getUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
});

/** Every organisation this user can open, with their level in each. */
export const getOrgs = cache(async (userId: string, isOperator: boolean) => {
  const mine = await db
    .select({ id: orgs.id, name: orgs.name, access: memberships.access, restricted: memberships.restricted })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt)))
    .orderBy(asc(orgs.name));
  const list = mine.map((m) => ({ id: m.id, name: m.name, level: m.access as Level, restricted: m.restricted }));
  if (isOperator) {
    const all = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).orderBy(asc(orgs.name));
    for (const o of all) {
      const at = list.findIndex((m) => m.id === o.id);
      if (at >= 0) list[at] = { ...list[at], level: "operator", restricted: false };
      else list.push({ id: o.id, name: o.name, level: "operator", restricted: false });
    }
  }
  return list;
});

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) redirect("/console/login");
  return user;
});

export const requireCtx = cache(async (): Promise<Ctx> => {
  const user = await requireUser();
  const list = await getOrgs(user.id, user.isOperator);
  if (list.length === 0) redirect(user.isOperator ? "/console/operator" : "/console/no-access");
  const chosen = (await cookies()).get(ORG_COOKIE)?.value;
  const current = list.find((o) => o.id === chosen) ?? (list.length === 1 ? list[0] : undefined);
  if (!current) redirect("/console/orgs");
  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, current.id) });
  if (!org) redirect("/console/orgs");
  return {
    user: {
      id: user.id,
      name: user.name || user.email || "You",
      email: user.email || "",
      image: user.image,
      isOperator: user.isOperator,
    },
    org,
    level: current.level,
    restricted: current.restricted,
    orgs: list.map(({ id, name, level }) => ({ id, name, level })),
  };
});

const isTeam = (c: Ctx) => c.level !== "hiring_manager";
const isAdmin = (c: Ctx) => c.level === "admin" || c.level === "operator";

/** Write access. Reading is governed by role visibility (see visibleRoles). */
export const can = {
  createRole: isTeam,
  editRubric: isTeam,
  sendQuestions: isTeam,
  editRoleSettings: isTeam,
  manageSources: isTeam,
  decide: (_: Ctx) => true,
  manageTeam: isAdmin,
  integrations: isAdmin,
  dataSettings: isAdmin,
  billing: isAdmin,
  orgSettings: isAdmin,
  operator: (c: Ctx) => c.user.isOperator,
};

export class Forbidden extends Error {
  constructor(what = "You do not have access to do that.") {
    super(what);
  }
}

export function assertCan(c: Ctx, check: (c: Ctx) => boolean, what?: string) {
  if (!check(c)) throw new Forbidden(what);
}

/**
 * Which roles this user can see in the current org, as a SQL condition.
 * Team-visible roles are open to the TA team and admins; a hiring manager
 * sees the roles they manage or were given. Restricted roles need an explicit grant.
 */
export function visibleRoles(c: Ctx): SQL {
  const inOrg = eq(roles.orgId, c.org.id);
  const granted = inArray(
    roles.id,
    db.select({ id: roleAccess.roleId }).from(roleAccess).where(eq(roleAccess.userId, c.user.id)),
  );
  if (c.level === "operator" || c.level === "admin") return inOrg;
  if (c.level === "ta") return and(inOrg, or(eq(roles.visibility, "team"), eq(roles.hiringManagerId, c.user.id), granted))!;
  if (c.restricted) return and(inOrg, granted)!;
  return and(inOrg, or(eq(roles.hiringManagerId, c.user.id), granted))!;
}

/** Loads one role the user may see, or sends them away. */
export async function requireRole(c: Ctx, roleId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(roleId)) redirect("/console");
  const [role] = await db.select().from(roles).where(and(eq(roles.id, roleId), visibleRoles(c)));
  if (!role) redirect("/console");
  return role;
}

export const now = () => new Date();
export const daysSince = (d: Date | string | null | undefined) =>
  d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)) : 0;

export { sql };
