"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, invites, memberships, orgs, roleAccess, users } from "@/lib/db/schema";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/console/password";
import { checkCode, issueTicket, sendCode } from "@/lib/console/codes";
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

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** Email and password. A wrong password and an unknown email read the same. */
export async function signInPassword(form: FormData) {
  const email = str(form, "email").toLowerCase();
  try {
    await signIn("password", { email, password: String(form.get("password") ?? ""), redirectTo: next(form) });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e instanceof CredentialsSignin ? e.code : "invalid";
      if (code === "unverified") redirect(`/console/verify?${q({ email, next: next(form) })}`);
      redirect(`/console/login?${q({ error: code === "locked" ? "locked" : "password", email, next: next(form) })}`);
    }
    throw e;
  }
}

/** Signs in with a one-time ticket, right after the person proved their address. */
async function signInWithTicket(email: string, to: string) {
  const ticket = await issueTicket(email);
  await signIn("password", { email, ticket, redirectTo: to });
}

/**
 * Creating an account: the password is stored hashed and nothing works until
 * the emailed code confirms the address. An address that was registered but
 * never confirmed can be registered again, so nobody can squat on someone
 * else's email.
 */
export async function signUp(form: FormData) {
  const name = str(form, "name").slice(0, 80);
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const back = (error: string) => redirect(`/console/signup?${q({ error, name, email })}`);
  if (!name) back("name");
  if (!validEmail(email)) back("email");
  const problem = passwordProblem(password, email);
  if (problem) back(problem);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing?.emailVerified) back("exists");
  const passwordHash = await hashPassword(password);
  if (existing) await db.update(users).set({ name, passwordHash, passwordSetAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, existing.id));
  else await db.insert(users).values({ name, email, passwordHash, passwordSetAt: new Date() });
  const sent = await sendCode(email, "verify");
  if (!sent.ok) back(sent.error);
  redirect(`/console/verify?${q({ email, next: next(form) })}`);
}

export async function confirmEmail(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const code = str(form, "code").replace(/\D/g, "");
  const back = (error: string) => redirect(`/console/verify?${q({ email, error, next: next(form) })}`);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || code.length !== 6 || !(await checkCode(email, "verify", code))) back("code");
  await db.update(users).set({ emailVerified: user!.emailVerified ?? new Date() }).where(eq(users.id, user!.id));
  await signInWithTicket(email, next(form));
}

export async function resendCode(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  // Same answer whether or not the address has an account.
  const sent = user && !user.emailVerified ? await sendCode(email, "verify") : { ok: true as const };
  redirect(`/console/verify?${q({ email, next: next(form), ...(sent.ok ? { sent: "1" } : { error: sent.error }) })}`);
}

/** Forgotten password, step one: a code by email. The reply never says whether the account exists. */
export async function requestReset(form: FormData) {
  const email = str(form, "email").toLowerCase();
  if (!validEmail(email)) redirect(`/console/reset?${q({ error: "email" })}`);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user) {
    const sent = await sendCode(email, "reset");
    if (!sent.ok) redirect(`/console/reset?${q({ error: sent.error, email })}`);
  }
  redirect(`/console/reset?${q({ email, step: "code" })}`);
}

/** Step two: the code and a new password. Every other session signs out. */
export async function resetPassword(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const code = str(form, "code").replace(/\D/g, "");
  const password = String(form.get("password") ?? "");
  const back = (error: string) => redirect(`/console/reset?${q({ email, step: "code", error })}`);
  const problem = passwordProblem(password, email);
  if (problem) back(problem);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || code.length !== 6 || !(await checkCode(email, "reset", code))) back("code");
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), passwordSetAt: now, sessionsValidFrom: now, emailVerified: user!.emailVerified ?? now, failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, user!.id));
  await signInWithTicket(email, "/console");
}

/** From account settings: needs the current password when there is one. */
export async function changePassword(form: FormData) {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const back = (code: string) => redirect(`/console/settings/account?saved=${encodeURIComponent(code)}`);
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) back("wrong-current");
  const problem = passwordProblem(password, user.email ?? "");
  if (problem) back(problem);
  const now = new Date();
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordSetAt: now, sessionsValidFrom: now }).where(eq(users.id, user.id));
  // This session is the one that stays signed in.
  await signInWithTicket(user.email!, "/console/settings/account?saved=password");
}

export async function signOutEverywhere() {
  const user = await requireUser();
  await db.update(users).set({ sessionsValidFrom: new Date() }).where(eq(users.id, user.id));
  (await cookies()).delete(ORG_COOKIE);
  await signOut({ redirectTo: "/console/login?signedout=1" });
}

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const name = str(form, "name").slice(0, 80);
  if (name) await db.update(users).set({ name }).where(eq(users.id, user.id));
  redirect("/console/settings/account?saved=profile");
}

/**
 * Self-serve: someone with a confirmed address creates their company and
 * becomes its admin. Off when WINNOW_SIGNUP=invite (companies are then set
 * up by Winnow's team).
 */
export async function createCompany(form: FormData) {
  const user = await requireUser();
  if (!user.emailVerified) redirect(`/console/verify?${q({ email: user.email ?? "" })}`);
  if (process.env.WINNOW_SIGNUP === "invite" && !user.isOperator) redirect("/console/welcome");
  const name = str(form, "name").slice(0, 120);
  if (name.length < 2) redirect("/console/welcome?error=name");
  const [made] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.actorId, user.id), eq(auditLog.action, "org.create")));
  if ((made?.n ?? 0) >= 5) redirect("/console/welcome?error=limit");
  const domain = str(form, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
  const [org] = await db.insert(orgs).values({ name, domain }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: user.id, access: "admin" });
  await audit({ orgId: org.id, actorId: user.id, action: "org.create", entity: "org", entityId: org.id, detail: { name, selfServe: true } });
  (await cookies()).set(ORG_COOKIE, org.id, cookieOpts);
  redirect("/console");
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
  // Only the person it was sent to, with that address confirmed, can use an invite.
  if (!user.emailVerified || (user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) redirect(`/console/invite/${token}?error=email`);
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
