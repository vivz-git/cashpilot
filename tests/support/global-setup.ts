import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "./env";

/** Migrate the test database and wipe data from previous runs. */
export default async function setup() {
  if (!/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(`TEST_DATABASE_URL must point at a database whose name contains "test" (got ${TEST_DATABASE_URL})`);
  }
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query("TRUNCATE organizations, audit_logs RESTART IDENTITY CASCADE");
  await pool.end();
}
