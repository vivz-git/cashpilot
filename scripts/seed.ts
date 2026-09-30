/**
 * Creates a demo workspace with fake invoices for local development.
 * Usage: npm run db:seed  (never runs in production)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { users } from "@/db/schema";
import { signup } from "@/server/auth/service";
import { importInvoicesCsv } from "@/server/invoices/import";

const DEMO_EMAIL = "demo@cashpilot.local";
const DEMO_PASSWORD = "demo-password-123";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production environment.");
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${DEMO_EMAIL}`);
  if (existing.length > 0) {
    console.log(`Demo user already exists. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }
  const owner = await signup(db, {
    organizationName: "Brightline Creative (demo)",
    name: "Demo Owner",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  const file = path.join(__dirname, "..", "e2e", "fixtures", "invoices.csv");
  const text = readFileSync(file, "utf8");
  const result = await importInvoicesCsv(
    db,
    { userId: owner.id, orgId: owner.organizationId, role: "owner" },
    { name: "demo-invoices.csv", text, size: Buffer.byteLength(text) },
  );
  if (!result.ok) throw new Error(`Demo import failed: ${JSON.stringify(result.errors)}`);
  console.log(`Seeded ${result.imported} fake invoices. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
