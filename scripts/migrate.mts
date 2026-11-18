// Applies drizzle/ migrations to DATABASE_URL (Neon). Skips when no Postgres URL is set
// (local dev uses PGlite, which auto-migrates).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.log("[migrate] no Postgres DATABASE_URL, skipping");
  process.exit(0);
}
await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
console.log("[migrate] done");
