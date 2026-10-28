// Applies database migrations (drizzle/). Runs before `next build` on Vercel
// production deploys, and locally before dev or tests. Previews never migrate,
// so an unmerged branch cannot change the production database.
import { existsSync, mkdirSync } from "node:fs";

// Migrations prefer the direct connection; the pooled one is the fallback (Supabase's
// direct address can be IPv6-only, which a build machine may not reach).
const candidates = [process.env.POSTGRES_URL_NON_POOLING, process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL, process.env.POSTGRES_URL].filter(Boolean);
const url = candidates[0] ?? "";
if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("migrate: skipped (preview deployment)");
  process.exit(0);
}
if (process.env.VERCEL && !url) {
  console.log("migrate: skipped (no database connected yet; the console shows a setup page)");
  process.exit(0);
}

const folder = "./drizzle";
if (!existsSync(folder)) {
  console.log("migrate: no migrations folder");
  process.exit(0);
}

/**
 * Supabase publishes every table in the public schema through its own REST
 * API, reachable with a key that is public by design. Winnow never uses that
 * API, so it is shut: row-level security on every table (with no policies,
 * nobody but the owner can read a row) and no grants to its API roles, now or
 * for tables added later.
 */
const LOCKDOWN = `
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on all functions in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on functions from anon, authenticated';
  end if;
end $$;`;

if (url) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const open = (u) => {
    const clean = new URL(u);
    clean.search = "";
    const local = /^(localhost|127\.0\.0\.1)$/.test(clean.hostname);
    return postgres(clean.toString(), { max: 1, prepare: false, connect_timeout: 10, ssl: local ? false : "require", onnotice: () => undefined });
  };
  let client;
  for (const u of candidates) {
    const c = open(u);
    try {
      await c`select 1`;
      client = c;
      break;
    } catch (e) {
      console.log(`migrate: could not reach ${new URL(u).hostname} (${e.code ?? e.message}), trying the next connection`);
      await c.end({ timeout: 1 }).catch(() => undefined);
    }
  }
  if (!client) throw new Error("migrate: no database connection worked");
  await migrate(drizzle({ client }), { migrationsFolder: folder });
  await client.unsafe(LOCKDOWN);
  await client.end();
  console.log("migrate: done (Postgres), public API locked down");
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await migrate(drizzle({ client }), { migrationsFolder: folder });
  await client.close();
  console.log("migrate: done (local PGlite)");
}
