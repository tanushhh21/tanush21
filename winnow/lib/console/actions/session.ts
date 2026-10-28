"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites, memberships, orgs, roleAccess } from "@/lib/db/schema";
import { ORG_COOKIE, getOrgs, requireUser } from "@/lib/console/context";
import { audit } from "@/lib/console/log";

/** Only ever return somewhere inside the console. */
const next = (form: FormData) => {
  const n = String(form.get("next") ?? "");
  return n.startsWith("/console") && !n.startsWith("//") ? n : "/console";
};

export async function signInGoogle(form: FormData) {
  await signIn("google", { redirectTo: next(form) });
}

export async function signInEmail(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect("/console/login?error=email");
  await signIn("resend", { email, redirectTo: next(form) });
}

export async function signInDev(form: FormData) {
  await signIn("dev", { email: form.get("email"), name: form.get("name"), redirectTo: next(form) });
}

export async function signOutAction() {
  (await cookies()).delete(ORG_COOKIE);
  await signOut({ redirectTo: "/console/login" });
}

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function chooseOrg(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("orgId") ?? "");
  const list = await getOrgs(user.id, user.isOperator);
  if (!list.some((o) => o.id === id)) redirect("/console/orgs");
  (await cookies()).set(ORG_COOKIE, id, cookieOpts);
  redirect(String(form.get("next") || "/console"));
}

/** Operators set up a new customer: the organisation, and an invite for its first admin. */
export async function createOrg(form: FormData) {
  const user = await requireUser();
  if (!user.isOperator) redirect("/console");
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect("/console/operator/overview?error=name");
  const domain = String(form.get("domain") ?? "").trim().toLowerCase() || null;
  const [org] = await db.insert(orgs).values({ name, domain }).returning();
  await audit({ orgId: org.id, actorId: user.id, action: "org.create", entity: "org", entityId: org.id, detail: { name } });
  const admin = String(form.get("adminEmail") ?? "").trim().toLowerCase();
  if (admin) {
    const { createInvite } = await import("@/lib/console/invites");
    await createInvite({ orgId: org.id, email: admin, access: "admin", roleIds: [], invitedBy: user.id, orgName: name });
  }
  (await cookies()).set(ORG_COOKIE, org.id, cookieOpts);
  redirect("/console");
}

/** Accepting an invite adds the membership and opens that organisation. */
export async function acceptInvite(form: FormData) {
  const user = await requireUser();
  const token = String(form.get("token") ?? "");
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())),
  });
  if (!invite) redirect(`/console/invite/${token}?error=expired`);
  const existing = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, user.id)),
  });
  if (existing) {
    await db
      .update(memberships)
      .set({ access: invite.access, restricted: invite.roleIds.length > 0, deactivatedAt: null })
      .where(eq(memberships.id, existing.id));
  } else {
    await db.insert(memberships).values({ orgId: invite.orgId, userId: user.id, access: invite.access, restricted: invite.roleIds.length > 0 });
  }
  if (invite.roleIds.length) {
    await db
      .insert(roleAccess)
      .values(invite.roleIds.map((roleId) => ({ roleId, userId: user.id })))
      .onConflictDoNothing();
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  await audit({ orgId: invite.orgId, actorId: user.id, action: "invite.accept", entity: "membership", entityId: user.id, detail: { access: invite.access } });
  (await cookies()).set(ORG_COOKIE, invite.orgId, cookieOpts);
  redirect("/console");
}
