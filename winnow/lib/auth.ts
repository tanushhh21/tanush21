/**
 * Sign-in. Google is the primary route and an emailed magic link the fallback;
 * no passwords. Each provider switches on when its keys are present.
 * A development-only sign-in exists for local testing and can never run on Vercel.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, realDb } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { EMAIL_FROM, loginEmail } from "./console/email";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

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

async function syncOperator(userId: string, email?: string | null) {
  const isOperator = Boolean(email && operators().includes(email.toLowerCase()));
  await db.update(users).set({ isOperator }).where(eq(users.id, userId));
}

const list: Provider[] = [];
if (providers.google) list.push(Google);
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
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = String(token.uid);
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) await syncOperator(user.id, user.email);
    },
  },
}));
