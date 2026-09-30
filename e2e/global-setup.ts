import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

export default async function globalSetup() {
  if (!/e2e|test/i.test(new URL(E2E_DATABASE_URL).pathname)) {
    throw new Error("E2E_DATABASE_URL must point at a dedicated e2e/test database");
  }
  const pool = new Pool({ connectionString: E2E_DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query("TRUNCATE organizations, audit_logs RESTART IDENTITY CASCADE");
  await pool.end();
}
