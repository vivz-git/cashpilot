import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import type { Role } from "@/db/schema";
import type { AuthContext } from "@/server/auth/context";
import { addTeamMember, signup } from "@/server/auth/service";
import { importInvoicesCsv } from "@/server/invoices/import";

export const PASSWORD = "correct horse battery";

export function uniqueEmail(prefix = "user") {
  return `${prefix}-${randomUUID().slice(0, 8)}@agency.example`;
}

/** Creates a new organization with an owner and returns the owner's context. */
export async function createOrg(name = "Test Agency"): Promise<AuthContext & { email: string }> {
  const email = uniqueEmail("owner");
  const user = await signup(getDb(), { organizationName: name, name: "Olivia Owner", email, password: PASSWORD });
  return { userId: user.id, orgId: user.organizationId, role: "owner", email };
}

export async function addUser(owner: AuthContext, role: Exclude<Role, "owner">): Promise<AuthContext> {
  const user = await addTeamMember(getDb(), owner, {
    name: `${role} user`,
    email: uniqueEmail(role),
    password: PASSWORD,
    role,
  });
  return { userId: user.id, orgId: user.organizationId, role };
}

export const CSV_HEADER =
  "customer_name,customer_email,invoice_number,invoice_date,due_date,amount,currency,account_manager,notes";

export function csvRow(p: Partial<Record<string, string>> = {}): string {
  const v = {
    customer_name: "Northwind Studio",
    customer_email: "ap@northwind.example",
    invoice_number: `INV-${randomUUID().slice(0, 6)}`,
    invoice_date: "2026-06-01",
    due_date: "2026-07-01",
    amount: "4250.00",
    currency: "USD",
    account_manager: "Priya Shah",
    notes: "",
    ...p,
  };
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    v.customer_name,
    v.customer_email,
    v.invoice_number,
    v.invoice_date,
    v.due_date,
    v.amount,
    v.currency,
    v.account_manager,
    v.notes,
  ]
    .map((x) => q(x ?? ""))
    .join(",");
}

export async function importRows(ctx: AuthContext, rows: string[], name = "invoices.csv") {
  const text = [CSV_HEADER, ...rows].join("\n");
  return importInvoicesCsv(getDb(), ctx, { name, text, size: Buffer.byteLength(text) });
}

/** Imports one invoice and returns its id. */
export async function createInvoice(ctx: AuthContext, p: Partial<Record<string, string>> = {}): Promise<string> {
  const number = p.invoice_number ?? `INV-${randomUUID().slice(0, 8)}`;
  const r = await importRows(ctx, [csvRow({ ...p, invoice_number: number })]);
  if (!r.ok) throw new Error(`import failed: ${JSON.stringify(r.errors)}`);
  const { invoices } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await getDb()
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.organizationId, ctx.orgId), eq(invoices.invoiceNumber, number)));
  return row!.id;
}
