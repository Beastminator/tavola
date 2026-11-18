import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type DB = NeonHttpDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// Production: DATABASE_URL = postgres://... (Neon). Migrations run at build time (scripts/migrate.ts).
// Local dev: no DATABASE_URL -> embedded PGlite in .data/pglite, auto-migrated on first use.
async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url?.startsWith("pglite:") ? url.slice(7) : path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

const g = globalThis as unknown as { __tavolaDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!g.__tavolaDb) {
    g.__tavolaDb = create().catch((err) => {
      g.__tavolaDb = undefined; // allow retry instead of caching the failure
      throw err;
    });
  }
  return g.__tavolaDb;
}

export { schema };
