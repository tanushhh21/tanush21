/**
 * One database handle for the whole server. Production (and anywhere
 * DATABASE_URL is set) talks to Neon Postgres; local development and tests use
 * PGlite, a real Postgres running in-process, stored in .data/pglite.
 * Migrations run separately (scripts/migrate.mjs), never on a request.
 *
 * The connection opens on first use, so pages that never touch the database
 * (the public website) are unaffected when it is missing.
 */
import { drizzle as neonDrizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { Pool } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export type DB = NeonDatabase<typeof schema>;

/** On Vercel the console needs DATABASE_URL; locally PGlite always works. */
export const dbConfigured = () => Boolean(process.env.DATABASE_URL) || !process.env.VERCEL;

const g = globalThis as unknown as { __winnowDb?: DB };

function connect(): DB {
  const url = process.env.DATABASE_URL;
  if (url) return neonDrizzle({ client: new Pool({ connectionString: url }), schema });
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  mkdirSync(dir, { recursive: true });
  // Same query API and dialect as Neon; the cast lets the app use one type.
  return pgliteDrizzle({ client: new PGlite(dir), schema }) as unknown as DB;
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

export { schema };
