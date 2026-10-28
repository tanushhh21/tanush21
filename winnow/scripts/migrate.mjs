// Applies database migrations (drizzle/). Runs before `next build` on Vercel
// production deploys, and locally before dev or tests. Previews never migrate,
// so an unmerged branch cannot change the production database.
import { existsSync, mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("migrate: skipped (preview deployment)");
  process.exit(0);
}
if (process.env.VERCEL && !url) {
  console.log("migrate: skipped (no DATABASE_URL yet; the console shows a setup page)");
  process.exit(0);
}

const folder = "./drizzle";
if (!existsSync(folder)) {
  console.log("migrate: no migrations folder");
  process.exit(0);
}

if (url) {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
  await pool.end();
  console.log("migrate: done (Neon)");
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
