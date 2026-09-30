import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type Holder = { pool?: Pool; db?: Database };
// Reuse the pool across hot reloads in development.
const holder = globalThis as unknown as { __cashpilotDb?: Holder };
holder.__cashpilotDb ??= {};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function getDb(): Database {
  const h = holder.__cashpilotDb!;
  if (!h.db) {
    h.pool = new Pool({ connectionString: connectionString(), max: 10 });
    h.db = drizzle(h.pool, { schema });
  }
  return h.db;
}

export async function closeDb(): Promise<void> {
  const h = holder.__cashpilotDb!;
  if (h.pool) await h.pool.end();
  h.pool = undefined;
  h.db = undefined;
}

export { schema };
