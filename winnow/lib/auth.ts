/**
 * Sign-in: email and password (confirmed by an emailed code), Google, or an
 * emailed sign-in link. Google and email links switch on when their keys are
 * present. A development-only sign-in exists for local testing and can never
 * run on Vercel.
 *
 * Operator access goes only to a confirmed address on the WINNOW_OPERATORS
 * list, so registering someone else's email can never grant it, and a
 * password set before an address was confirmed is wiped when its real owner
 * proves it through Google or an email link.
 */
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, isNull } from "drizzle-orm";
import { db, realDb } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { EMAIL_FROM, loginEmail } from "./console/email";
import { verifyPassword } from "./console/password";
import { checkCode, sendCode } from "./console/codes";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    /** When this sign-in happened (seconds), to honour "sign out everywhere". */
    authAt?: number;
  }
}

/** Why a password sign-in failed, as the code the login page explains. */
class SignInProblem extends CredentialsSignin {
  constructor(code: "invalid" | "locked" | "unverified") {
    super();
    this.code = code;
  }
}

const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;

export const providers = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  email: Boolean(process.env.RESEND_API_KEY),
  dev: process.env.WINNOW_DEV_LOGIN === "1" && !process.env.VERCEL,
};

/** Emails in WINNOW_OPERATORS are Winnow staff: every customer, plus the operator console. */
const operators = () =>
  (process.env.WINNOW_OPERATORS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

async function syncOperator(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return;
  const isOperator = Boolean(u.email && u.emailVerified && operators().includes(u.email.toLowerCase()));
  if (isOperator !== u.isOperator) await db.update(users).set({ isOperator }).where(eq(users.id, userId));
}

const list: Provider[] = [];
// Linking a Google sign-in to an account with the same email is safe because
// unconfirmed Google addresses are refused (see signIn below).
if (providers.google) list.push(Google({ allowDangerousEmailAccountLinking: true }));

/** Email and password, or a one-time ticket issued right after proving the address. */
list.push(
  Credentials({
    id: "password",
    name: "Password",
    credentials: { email: {}, password: {}, ticket: {} },
    async authorize(c) {
      const email = String(c?.email ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new SignInProblem("invalid");
      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (c?.ticket) {
        if (!user || !(await checkCode(email, "ticket", String(c.ticket)))) throw new SignInProblem("invalid");
        return user;
      }
      if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new SignInProblem("locked");
      const ok = await verifyPassword(String(c?.password ?? ""), user?.passwordHash);
      if (!user || !ok) {
        if (user) {
          const failed = user.failedLogins + 1;
          await db
            .update(users)
            .set(failed >= LOCK_AFTER ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed })
            .where(eq(users.id, user.id));
          if (failed >= LOCK_AFTER) throw new SignInProblem("locked");
        }
        throw new SignInProblem("invalid");
      }
      if (user.failedLogins || user.lockedUntil) await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
      if (!user.emailVerified) {
        await sendCode(email, "verify");
        throw new SignInProblem("unverified");
      }
      return user;
    },
  }),
);
if (providers.email) {
  list.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: provider.from, to: identifier, ...loginEmail(url) }),
        });
        if (!res.ok) throw new Error(`Sign-in email failed: ${res.status}`);
      },
    }),
  );
}
if (providers.dev) {
  list.push(
    Credentials({
      id: "dev",
      name: "Development",
      credentials: { email: { label: "Email" }, name: { label: "Name" } },
      async authorize(c) {
        const email = String(c?.email ?? "")
          .trim()
          .toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return null;
        const found = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (found) return found;
        const name = String(c?.name ?? "").trim() || email.split("@")[0];
        const [made] = await db.insert(users).values({ email, name, emailVerified: new Date() }).returning();
        return made;
      },
    }),
  );
}

// The config is built per request so the adapter gets the real connection,
// and nothing touches the database at build time.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(realDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: list,
  trustHost: true,
  pages: { signIn: "/console/login", verifyRequest: "/console/login?sent=1", error: "/console/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      // Proving the address through Google or an email link wipes any password
      // someone set on it before it was confirmed.
      if ((account?.provider === "google" || account?.provider === "resend") && user.email)
        await db
          .update(users)
          .set({ passwordHash: null, passwordSetAt: null })
          .where(and(eq(users.email, user.email.toLowerCase()), isNull(users.emailVerified)));
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.authAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = String(token.uid);
      if (typeof token.authAt === "number") session.authAt = token.authAt;
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id) return;
      if (account?.provider === "google") await db.update(users).set({ emailVerified: new Date() }).where(and(eq(users.id, user.id), isNull(users.emailVerified)));
      await syncOperator(user.id);
    },
  },
}));
