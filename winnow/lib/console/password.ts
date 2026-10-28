/**
 * Passwords: scrypt with a random salt per password, compared in constant
 * time. The stored form carries its own parameters so they can be raised
 * later without breaking existing accounts.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

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
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (/^(.)\1+$/.test(password)) return "Use more than one character.";
  const lower = password.toLowerCase();
  if (email && lower.includes(email.toLowerCase().split("@")[0]) && email.split("@")[0].length >= 4) return "Do not include your email in the password.";
  if (COMMON.some((c) => lower === c || lower === `${c}123` || lower === `${c}1234`)) return "That password is too common.";
  return null;
}
