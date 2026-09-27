import { describe, expect, it } from "vitest";
import { MAX_CSV_ROWS, parseInvoiceCsv } from "@/server/invoices/csv";

const HEADER =
  "customer_name,customer_email,invoice_number,invoice_date,due_date,amount,currency,account_manager,notes";

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

const GOOD = "Northwind Studio,ap@northwind.example,INV-1,2026-07-01,2026-07-31,4250.00,USD,Priya Shah,Retainer";

describe("parseInvoiceCsv", () => {
  it("parses valid rows into minor units", () => {
    const r = parseInvoiceCsv(csv(GOOD));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      customerName: "Northwind Studio",
      customerEmail: "ap@northwind.example",
      invoiceNumber: "INV-1",
      amountMinor: 425000,
      currency: "USD",
      accountManager: "Priya Shah",
      notes: "Retainer",
    });
  });

  it("supports multiple currencies with their own decimal rules", () => {
    const r = parseInvoiceCsv(
      csv(
        "A,a@a.example,INV-1,2026-01-01,2026-01-31,\"1,250.50\",usd,,",
        "B,b@b.example,INV-2,2026-01-01,2026-01-31,99.99,EUR,,",
        "C,c@c.example,INV-3,2026-01-01,2026-01-31,150000,JPY,,",
        "D,d@d.example,INV-4,2026-01-01,2026-01-31,10.5,GBP,,",
      ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.currency, x.amountMinor])).toEqual([
      ["USD", 125050],
      ["EUR", 9999],
      ["JPY", 150000],
      ["GBP", 1050],
    ]);
  });

  it("rejects decimals a currency does not have", () => {
    const r = parseInvoiceCsv(csv("C,c@c.example,INV-3,2026-01-01,2026-01-31,1500.50,JPY,,"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 2, column: "amount" });
  });

  it("rejects unknown currency codes", () => {
    const r = parseInvoiceCsv(csv("A,a@a.example,INV-1,2026-01-01,2026-01-31,10,XYZ,,", "A,a@a.example,INV-2,2026-01-01,2026-01-31,10,,,"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.column)).toEqual(["currency", "currency"]);
  });

  it.each([
    ["abc", "not a valid amount"],
    ["-100", "not a valid amount"],
    ["$100", "not a valid amount"],
    ["1.234", "not a valid amount"],
    ["0", "greater than zero"],
    ["", "Amount is required"],
  ])("rejects invalid amount %j", (amount, message) => {
    const r = parseInvoiceCsv(csv(`A,a@a.example,INV-1,2026-01-01,2026-01-31,${amount},USD,,`));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.column).toBe("amount");
    expect(r.errors[0]!.message).toContain(message);
  });

  it.each(["2026-02-30", "03/04/2026", "2026-1-5", "yesterday", "2026-13-01"])("rejects invalid date %j", (date) => {
    const r = parseInvoiceCsv(csv(`A,a@a.example,INV-1,${date},2026-12-31,10,USD,,`));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 2, column: "invoice_date" });
    expect(r.errors[0]!.message).toContain("YYYY-MM-DD");
  });

  it("rejects a due date before the invoice date", () => {
    const r = parseInvoiceCsv(csv("A,a@a.example,INV-1,2026-03-01,2026-02-01,10,USD,,"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ column: "due_date", message: "Due date is before the invoice date." });
  });

  it("rejects missing and invalid email addresses", () => {
    const r = parseInvoiceCsv(
      csv(
        "A,,INV-1,2026-01-01,2026-01-31,10,USD,,",
        "B,not-an-email,INV-2,2026-01-01,2026-01-31,10,USD,,",
        "C,\"a@x.example, b@y.example\",INV-3,2026-01-01,2026-01-31,10,USD,,",
      ),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => [e.line, e.column])).toEqual([
      [2, "customer_email"],
      [3, "customer_email"],
      [4, "customer_email"],
    ]);
    expect(r.errors[0]!.message).toBe("Customer email is required.");
  });

  it("rejects duplicate invoice numbers within the file (case-insensitive)", () => {
    const r = parseInvoiceCsv(csv(GOOD, GOOD.replace("INV-1", "inv-1")));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      { line: 3, column: "invoice_number", message: 'Duplicate invoice number "inv-1" (also on line 2).' },
    ]);
  });

  it("reports missing required columns", () => {
    const r = parseInvoiceCsv("customer_name,invoice_number\nA,INV-1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.message).toContain("customer_email");
    expect(r.errors[0]!.message).toContain("amount");
  });

  it("reports malformed rows (wrong number of fields, bad quotes)", () => {
    const r = parseInvoiceCsv(csv(GOOD, "Only,three,fields", 'Bad "quote,a@a.example,INV-9,2026-01-01,2026-01-31,10,USD,,'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.line === 3 && /fewer values/.test(e.message))).toBe(true);
  });

  it("reports unclosed quotes", () => {
    const r = parseInvoiceCsv(csv('"Unclosed,a@a.example,INV-1,2026-01-01,2026-01-31,10,USD,,'));
    expect(r.ok).toBe(false);
  });

  it("rejects empty files, header-only files and binary content", () => {
    expect(parseInvoiceCsv("").ok).toBe(false);
    expect(parseInvoiceCsv(HEADER).ok).toBe(false);
    expect(parseInvoiceCsv("PK\u0003\u0004\u0000\u0000binary").ok).toBe(false);
  });

  it("rejects files over the row limit", () => {
    const rows = Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => GOOD.replace("INV-1", `INV-${i}`));
    const r = parseInvoiceCsv(csv(...rows));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.message).toContain("Too many rows");
  });

  it("normalises headers (BOM, case, spaces) and ignores unknown columns with a warning", () => {
    const text = "﻿Customer Name,Customer Email,Invoice Number,Invoice Date,Due Date,Amount,Currency,PO\nA,A@Example.COM,INV-1,2026-01-01,2026-01-31,10,usd,PO-7";
    const r = parseInvoiceCsv(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]!.customerEmail).toBe("a@example.com");
    expect(r.rows[0]!.accountManager).toBeNull();
    expect(r.warnings[0]).toContain("po");
  });

  it("keeps multi-line notes, strips control characters and stores formula-like text verbatim", () => {
    const r = parseInvoiceCsv(csv('=HYPERLINK("x"),a@a.example,INV-1,2026-01-01,2026-01-31,10,USD,,"Line one\nLine two\u0007"'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]!.customerName).toBe('=HYPERLINK("x")');
    expect(r.rows[0]!.notes).toBe("Line one\nLine two");
  });

  it("lists every error rather than stopping at the first", () => {
    const r = parseInvoiceCsv(csv(",bad,,2026-99-01,2026-01-31,x,US,,"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.column).sort()).toEqual(
      ["currency", "customer_email", "customer_name", "invoice_date", "invoice_number"].sort(),
    );
  });
});
