import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { activities, imports, invoices } from "@/db/schema";
import { importInvoicesCsv } from "@/server/invoices/import";
import { getDashboard } from "@/server/invoices/queries";
import { addUser, createOrg, CSV_HEADER, csvRow, importRows } from "../support/factories";

describe("CSV import", () => {
  it("stores every valid invoice with an import activity", async () => {
    const owner = await createOrg();
    const r = await importRows(owner, [
      csvRow({ invoice_number: "INV-100", amount: "1000.00", currency: "USD" }),
      csvRow({ invoice_number: "INV-101", amount: "250.50", currency: "EUR", notes: "PO 7781 attached" }),
    ]);
    expect(r).toMatchObject({ ok: true, imported: 2, skippedDuplicates: [] });

    const rows = await getDb().select().from(invoices).where(eq(invoices.organizationId, owner.orgId));
    expect(rows.map((i) => [i.invoiceNumber, i.amountMinor, i.currency, i.status, i.followUpCount]).sort()).toEqual([
      ["INV-100", 100000, "USD", "open", 0],
      ["INV-101", 25050, "EUR", "open", 0],
    ]);
    const acts = await getDb().select().from(activities).where(eq(activities.organizationId, owner.orgId));
    expect(acts.filter((a) => a.type === "invoice_imported")).toHaveLength(2);
  });

  it("skips invoice numbers that already exist (case-insensitive) without overwriting them", async () => {
    const owner = await createOrg();
    await importRows(owner, [csvRow({ invoice_number: "INV-200", amount: "100.00" })]);
    const r = await importRows(owner, [
      csvRow({ invoice_number: "inv-200", amount: "999.00" }),
      csvRow({ invoice_number: "INV-201" }),
    ]);
    expect(r).toMatchObject({ ok: true, imported: 1, skippedDuplicates: ["inv-200"] });
    const [original] = await getDb()
      .select()
      .from(invoices)
      .where(and(eq(invoices.organizationId, owner.orgId), eq(invoices.invoiceNumber, "INV-200")));
    expect(original!.amountMinor).toBe(10000);
    const [imp] = await getDb()
      .select()
      .from(imports)
      .where(eq(imports.organizationId, owner.orgId))
      .orderBy(imports.createdAt)
      .offset(1);
    expect(imp).toMatchObject({ importedCount: 1, skippedCount: 1 });
  });

  it("imports nothing when any row is invalid", async () => {
    const owner = await createOrg();
    const r = await importRows(owner, [csvRow({ invoice_number: "INV-300" }), csvRow({ customer_email: "" })]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 3, column: "customer_email" });
    const rows = await getDb().select().from(invoices).where(eq(invoices.organizationId, owner.orgId));
    expect(rows).toHaveLength(0);
  });

  it("asks for column matching on another layout, imports nothing until confirmed, then imports with the mapping", async () => {
    const owner = await createOrg();
    // Hand-written accounting-style layout (not a real vendor export).
    const text = [
      "ContactName,EmailAddress,InvoiceNumber,InvoiceDate,DueDate,Total,InvoiceAmountDue,Currency",
      "Fable Creative,ap@fablecreative.example,INV-0212,15 Jul 2026,14 Aug 2026,3600.00,3600.00,GBP",
      'Orchard PR,accounts@orchardpr.example,INV-0219,02 Aug 2026,01 Sep 2026,"2,150.00","1,150.00",GBP',
    ].join("\n");
    const file = { name: "xero-export.csv", text, size: Buffer.byteLength(text) };

    const first = await importInvoicesCsv(getDb(), owner, file);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.errors).toEqual([]);
    expect(first.needsMapping?.suggested.amount).toBe("InvoiceAmountDue");
    expect(await getDb().select().from(invoices).where(eq(invoices.organizationId, owner.orgId))).toHaveLength(0);

    const second = await importInvoicesCsv(getDb(), owner, file, {
      columns: first.needsMapping!.suggested,
      dateFormat: first.needsMapping!.dateFormat ?? "ymd",
    });
    expect(second).toMatchObject({ ok: true, imported: 2 });
    const rows = await getDb().select().from(invoices).where(eq(invoices.organizationId, owner.orgId));
    expect(rows.map((i) => [i.invoiceNumber, i.dueDate, i.amountMinor, i.currency]).sort()).toEqual([
      ["INV-0212", "2026-08-14", 360000, "GBP"],
      ["INV-0219", "2026-09-01", 115000, "GBP"],
    ]);
  });

  it("returns row errors together with the column choices when a mapped file has problems", async () => {
    const owner = await createOrg();
    const text = "Customer,Email,Num,Date,Due date,Open balance\nHarbor,ap@harbor.example,1043,03/04/2026,03/05/2026,$100.00";
    const r = await importInvoicesCsv(
      getDb(),
      owner,
      { name: "qb.csv", text, size: text.length },
      {
        columns: { customer_name: "Customer", customer_email: "Email", invoice_number: "Num", invoice_date: "Date", due_date: "Due date", amount: "Open balance" },
        dateFormat: "dmy",
        defaultCurrency: "EUR",
      },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.needsMapping?.dateFormat).toBeNull();
    expect(r.errors[0]).toMatchObject({ line: 2, column: "Open balance" });
    expect(await getDb().select().from(invoices).where(eq(invoices.organizationId, owner.orgId))).toHaveLength(0);
  });

  it("allows the same invoice number in different organizations", async () => {
    const a = await createOrg("A");
    const b = await createOrg("B");
    expect((await importRows(a, [csvRow({ invoice_number: "INV-1" })])).ok).toBe(true);
    expect(await importRows(b, [csvRow({ invoice_number: "INV-1" })])).toMatchObject({ ok: true, imported: 1 });
  });

  it("rejects non-CSV and oversized files", async () => {
    const owner = await createOrg();
    const text = [CSV_HEADER, csvRow()].join("\n");
    await expect(importInvoicesCsv(getDb(), owner, { name: "x.xlsx", text, size: 100 })).rejects.toThrow(".csv");
    await expect(importInvoicesCsv(getDb(), owner, { name: "x.csv", text, size: 5 * 1024 * 1024 })).rejects.toThrow(
      "too large",
    );
  });

  it("does not let viewers import", async () => {
    const owner = await createOrg();
    const viewer = await addUser(owner, "viewer");
    await expect(importRows(viewer, [csvRow()])).rejects.toThrow("permission");
  });

  it("reports outstanding totals per currency without conversion", async () => {
    const owner = await createOrg();
    await importRows(owner, [
      csvRow({ amount: "100.00", currency: "USD", due_date: "2026-07-01" }),
      csvRow({ amount: "50.25", currency: "USD", due_date: "2026-12-01" }),
      csvRow({ amount: "70.00", currency: "EUR", due_date: "2026-07-01" }),
    ]);
    const d = await getDashboard(getDb(), owner, new Date("2026-08-01T12:00:00Z"));
    const usd = d.totals.find((t) => t.currency === "USD");
    expect(usd).toMatchObject({ outstandingMinor: 15025, overdueMinor: 10000, openCount: 2, overdueCount: 1 });
    expect(d.totals.find((t) => t.currency === "EUR")).toMatchObject({ outstandingMinor: 7000 });
    // Overdue and never contacted → needs attention; not yet due → does not.
    expect(d.needsAttention).toHaveLength(2);
  });
});
