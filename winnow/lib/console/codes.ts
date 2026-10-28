/**
 * Email codes: six digits to confirm an address or reset a password, and
 * one-time sign-in tickets. Codes are stored only as a keyed hash; each
 * expires in 15 minutes and dies after five wrong tries; at most five are
 * sent to one address an hour.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailCodes } from "@/lib/db/schema";
import { layout, sendEmail } from "./email";

type Purpose = "verify" | "reset" | "ticket";
const TTL = 15 * 60_000;

const hash = (email: string, purpose: Purpose, code: string) =>
  createHmac("sha256", process.env.AUTH_SECRET || "local-dev-only").update(`${purpose}:${email.toLowerCase()}:${code}`).digest("base64");

export async function sendCode(email: string, purpose: "verify" | "reset"): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.toLowerCase();
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailCodes)
    .where(and(eq(emailCodes.email, e), eq(emailCodes.purpose, purpose), gt(emailCodes.createdAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= 5) return { ok: false, error: "Too many codes for this address. Try again in an hour." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.delete(emailCodes).where(and(eq(emailCodes.email, e), eq(emailCodes.purpose, purpose), sql`${emailCodes.expiresAt} < now()`));
  await db.insert(emailCodes).values({ email: e, purpose, codeHash: hash(e, purpose, code), expiresAt: new Date(Date.now() + TTL) });
  const what = purpose === "verify" ? "confirm your email for Winnow" : "reset your Winnow password";
  const res = await sendEmail({
    to: e,
    subject: purpose === "verify" ? `${code} is your Winnow code` : `${code} is your Winnow password reset code`,
    text: `Your code to ${what} is ${code}.\n\nIt expires in 15 minutes. If you did not ask for it, ignore this email: nothing changes without the code.`,
    html: layout([`Your code to ${what} is:`, code, "It expires in 15 minutes. If you did not ask for it, ignore this email: nothing changes without the code."]),
  });
  return res.ok ? { ok: true } : { ok: false, error: "The email could not be sent. Try again in a minute." };
}

/** True once, for the latest live code; wrong tries count against it. */
export async function checkCode(email: string, purpose: Purpose, code: string) {
  const e = email.toLowerCase();
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(and(eq(emailCodes.email, e), eq(emailCodes.purpose, purpose), gt(emailCodes.expiresAt, new Date())))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= 5) return false;
  const a = Buffer.from(hash(e, purpose, code.trim()));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(emailCodes).set({ attempts: row.attempts + 1 }).where(eq(emailCodes.id, row.id));
    return false;
  }
  await db.delete(emailCodes).where(and(eq(emailCodes.email, e), eq(emailCodes.purpose, purpose)));
  return true;
}

/** A one-time ticket that signs this person in within two minutes, after they proved the address. */
export async function issueTicket(email: string) {
  const t = randomBytes(24).toString("base64url");
  await db.insert(emailCodes).values({ email: email.toLowerCase(), purpose: "ticket", codeHash: hash(email, "ticket", t), expiresAt: new Date(Date.now() + 120_000) });
  return t;
}
