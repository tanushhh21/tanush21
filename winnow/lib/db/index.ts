/**
 * One database handle for the whole server. Production talks to Postgres on
 * Supabase (Mumbai) through its connection pooler; local development and
 * tests use PGlite, a real Postgres running in-process, stored in .data/pglite.
 * Migrations run separately (scripts/migrate.mjs), never on a request.
 *
 * The connection opens on first use, so pages that never touch the database
 * (the public website) are unaffected when it is missing.
 */
import { drizzle as pgDrizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

/**
 * The pooled connection string. Vercel's Supabase integration names it
 * POSTGRES_URL; DATABASE_URL works too, for a database added by hand.
 */
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

/** On Vercel the console needs a database; locally PGlite always works. */
export const dbConfigured = () => Boolean(databaseUrl()) || !process.env.VERCEL;

const g = globalThis as unknown as { __winnowDb?: DB };

function connect(): DB {
  const url = databaseUrl();
  if (url) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // The pooler runs in transaction mode, which cannot hold prepared statements.
    // Query-string extras (sslmode, supa=…) are dropped: SSL is set here, and the
    // driver would otherwise send unknown ones to the server as settings.
    const client = postgres(withoutQuery(url), { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, ssl: local ? false : "require" });
    return pgDrizzle({ client, schema });
  }
  if (process.env.VERCEL) throw new Error("The database is not connected");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  mkdirSync(dir, { recursive: true });
  // Same query API and dialect as Postgres; the cast lets the app use one type.
  return pgliteDrizzle({ client: new PGlite(dir), schema }) as unknown as DB;
}

function withoutQuery(url: string) {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** The real connection, opened on first call. */
export const realDb = (): DB => g.__winnowDb ?? (g.__winnowDb = connect());

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const real = realDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Rows from a raw query, whichever driver ran it (postgres-js returns an array, PGlite an object). */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];
}

export { schema };
