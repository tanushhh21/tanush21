/**
 * Passwords: scrypt with a random salt per password, compared in constant
 * time. The stored form carries its own parameters so they can be raised
 * later without breaking existing accounts.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { PASSWORD_RULES } from "./password-rules";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384;
const R = 8;
const P = 1;
const LEN = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  // With no stored hash, still do the work, so a wrong email takes as long as a wrong password.
  const parts = (stored ?? `scrypt$${N}$${R}$${P}$${randomBytes(16).toString("base64")}$${randomBytes(LEN).toString("base64")}`).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return Boolean(stored) && got.length === expected.length && timingSafeEqual(got, expected);
}

const COMMON = ["password", "1234567890", "qwertyuiop", "winnow", "letmein", "welcome", "iloveyou", "admin"];

/** A reason the password is not acceptable, or null. */
export function passwordProblem(password: string, email: string) {
  const broken = PASSWORD_RULES.find((r) => !r.test(password));
  if (broken) return broken.problem;
  if (password.length > 128) return "Use at most 128 characters.";
  const lower = password.toLowerCase();
  // Only a password that is essentially the email is refused; a name inside a longer phrase is fine.
  const local = email.toLowerCase().split("@")[0] ?? "";
  if (email && (lower.includes(email.toLowerCase()) || (local.length >= 4 && lower.replace(/[^a-z]/g, "") === local.replace(/[^a-z]/g, "")))) return "Do not use your email as the password.";
  if (COMMON.some((c) => lower.replace(/\d+$/, "") === c)) return "That password is too common.";
  return null;
}
