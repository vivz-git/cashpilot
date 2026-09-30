import { describe, expect, it } from "vitest";
import {
  detectDateFormat,
  inspectCsv,
  MAX_CSV_ROWS,
  parseFlexibleDate,
  parseInvoiceCsv,
  stripCurrencyMarks,
  type ColumnMapping,
} from "@/server/invoices/csv";

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

// Hand-written layouts modelled on typical accounting exports. They are not real vendor exports.
const XERO_STYLE = [
  "ContactName,EmailAddress,InvoiceNumber,InvoiceDate,DueDate,Total,InvoiceAmountDue,Currency",
  "Fable Creative,ap@fablecreative.example,INV-0212,15 Jul 2026,14 Aug 2026,3600.00,3600.00,GBP",
  "Orchard PR,accounts@orchardpr.example,INV-0219,02 Aug 2026,01 Sep 2026,2150.00,1150.00,GBP",
].join("\n");

const QUICKBOOKS_STYLE = [
  "Date,Transaction type,Num,Customer,Customer email,Due date,Open balance",
  '15/07/2026,Invoice,1043,Harbor Design Co,ap@harbor.example,14/08/2026,"$4,250.00"',
  '02/08/2026,Invoice,1051,Beacon Media Ltd,ap@beacon.example,01/09/2026,"$1,980.50"',
].join("\n");

const QB_COLUMNS: ColumnMapping["columns"] = {
  customer_name: "Customer",
  customer_email: "Customer email",
  invoice_number: "Num",
  invoice_date: "Date",
  due_date: "Due date",
  amount: "Open balance",
};

describe("inspectCsv", () => {
  it("recognises CashPilot's own format as needing no column matching", () => {
    expect(inspectCsv(csv(GOOD))).toMatchObject({ ok: true, canonical: true });
  });

  it("suggests columns for an accounting-style export, preferring the amount still owed", () => {
    const r = inspectCsv(XERO_STYLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.canonical).toBe(false);
    expect(r.inspection.suggested).toEqual({
      customer_name: "ContactName",
      customer_email: "EmailAddress",
      invoice_number: "InvoiceNumber",
      invoice_date: "InvoiceDate",
      due_date: "DueDate",
      amount: "InvoiceAmountDue",
      currency: "Currency",
    });
    expect(r.inspection.rowCount).toBe(2);
    expect(r.inspection.samples.ContactName).toBe("Fable Creative");
    expect(r.inspection.dateFormat).toBe("ymd");
  });

  it("detects day-first dates and leaves fields the file does not have for the user", () => {
    const r = inspectCsv(QUICKBOOKS_STYLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inspection.suggested).toEqual(QB_COLUMNS);
    expect(r.inspection.dateFormat).toBe("dmy");
  });

  it("reports empty and header-only files", () => {
    expect(inspectCsv("")).toMatchObject({ ok: false });
    expect(inspectCsv("ContactName,Total")).toMatchObject({ ok: false });
  });
});

describe("parseInvoiceCsv with a column mapping", () => {
  const xero: ColumnMapping = {
    columns: {
      customer_name: "ContactName",
      customer_email: "EmailAddress",
      invoice_number: "InvoiceNumber",
      invoice_date: "InvoiceDate",
      due_date: "DueDate",
      amount: "InvoiceAmountDue",
      currency: "Currency",
    },
    dateFormat: "ymd",
  };

  it("imports an accounting-style file with month-name dates", () => {
    const r = parseInvoiceCsv(XERO_STYLE, xero);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.invoiceNumber, x.invoiceDate, x.dueDate, x.amountMinor, x.currency])).toEqual([
      ["INV-0212", "2026-07-15", "2026-08-14", 360000, "GBP"],
      ["INV-0219", "2026-08-02", "2026-09-01", 115000, "GBP"],
    ]);
    expect(r.warnings[0]).toContain("Total");
  });

  it("uses the chosen date order, strips matching currency symbols and applies a default currency", () => {
    const r = parseInvoiceCsv(QUICKBOOKS_STYLE, { columns: QB_COLUMNS, dateFormat: "dmy", defaultCurrency: "usd" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toMatchObject({
      invoiceNumber: "1043",
      invoiceDate: "2026-07-15",
      dueDate: "2026-08-14",
      amountMinor: 425000,
      currency: "USD",
    });
    expect(r.rows[1]).toMatchObject({ amountMinor: 198050 });
  });

  it("refuses a currency symbol that contradicts the invoice currency", () => {
    const r = parseInvoiceCsv(QUICKBOOKS_STYLE, { columns: QB_COLUMNS, dateFormat: "dmy", defaultCurrency: "GBP" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 2, column: "Open balance" });
    expect(r.errors[0]!.message).toContain("GBP");
  });

  it("reports dates that do not fit the chosen order, naming the file's own column", () => {
    const r = parseInvoiceCsv(QUICKBOOKS_STYLE, { columns: QB_COLUMNS, dateFormat: "mdy", defaultCurrency: "USD" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 2, column: "Date" });
    expect(r.errors[0]!.message).toContain("MM/DD/YYYY");
  });

  it("requires every required field and rejects unknown or reused columns and invalid default currencies", () => {
    const missing = parseInvoiceCsv(XERO_STYLE, { columns: { customer_name: "ContactName" }, dateFormat: "ymd" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]!.message).toContain("Customer email");

    const unknown = parseInvoiceCsv(XERO_STYLE, { ...xero, columns: { ...xero.columns, notes: "Nope" } });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors[0]!.message).toContain("Nope");

    const reused = parseInvoiceCsv(XERO_STYLE, { ...xero, columns: { ...xero.columns, notes: "ContactName" } });
    expect(reused.ok).toBe(false);
    if (!reused.ok) expect(reused.errors[0]!.message).toContain("only be used once");

    const badCurrency = parseInvoiceCsv(XERO_STYLE, {
      ...xero,
      columns: { ...xero.columns, currency: undefined },
      defaultCurrency: "ZZZ",
    });
    expect(badCurrency.ok).toBe(false);
  });

  it("still validates every row (email, duplicates, due date order)", () => {
    const text = [
      "Client,Email,Invoice #,Issued,Due,Balance,Currency",
      "A,not-an-email,A-1,2026-01-01,2026-01-31,10,USD",
      "B,b@b.example,A-1,2026-01-01,2026-01-31,10,USD",
      "C,c@c.example,A-3,2026-02-01,2026-01-01,10,USD",
    ].join("\n");
    const inspected = inspectCsv(text);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    const r = parseInvoiceCsv(text, { columns: inspected.inspection.suggested, dateFormat: "ymd" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => [e.line, e.column])).toEqual([
      [2, "Email"],
      [3, "Invoice #"],
      [4, "Due"],
    ]);
  });
});

describe("date and amount helpers", () => {
  it.each([
    ["2026-07-15", "dmy", "2026-07-15"],
    ["2026/07/15", "mdy", "2026-07-15"],
    ["15 Jul 2026", "mdy", "2026-07-15"],
    ["15-Jul-2026", "ymd", "2026-07-15"],
    ["July 15, 2026", "dmy", "2026-07-15"],
    ["03/04/2026", "dmy", "2026-04-03"],
    ["03/04/2026", "mdy", "2026-03-04"],
    ["2026-07-15T00:00:00Z", "ymd", "2026-07-15"],
    ["03/04/2026", "ymd", null],
    ["31/02/2026", "dmy", null],
    ["15 Foo 2026", "dmy", null],
    ["03/04/26", "dmy", null],
  ] as const)("parseFlexibleDate(%j, %s) is %j", (value, format, expected) => {
    expect(parseFlexibleDate(value, format)).toBe(expected);
  });

  it("detects the numeric date order only when the file makes it unambiguous", () => {
    expect(detectDateFormat(["15/07/2026", "01/02/2026"])).toBe("dmy");
    expect(detectDateFormat(["07/15/2026", "01/02/2026"])).toBe("mdy");
    expect(detectDateFormat(["01/02/2026", "03/04/2026"])).toBeNull();
    expect(detectDateFormat(["15/07/2026", "07/15/2026"])).toBeNull();
    expect(detectDateFormat(["2026-07-15", "15 Jul 2026"])).toBe("ymd");
  });

  it.each([
    ["$4,250.00", "USD", "4,250.00"],
    ["US$100", "USD", "100"],
    ["£10.50", "GBP", "10.50"],
    ["10.50 GBP", "GBP", "10.50"],
    ["EUR 99", "EUR", "99"],
    ["1200", "JPY", "1200"],
  ] as const)("stripCurrencyMarks keeps the number (case %#)", (raw, currency, value) => {
    expect(stripCurrencyMarks(raw, currency)).toEqual({ value });
  });

  it.each([
    ["$100", "GBP", "GBP"],
    ["€100", "USD", "USD"],
    ["100 EUR", "USD", "EUR"],
    ["-100", "USD", "greater than zero"],
    ["($100.00)", "USD", "greater than zero"],
  ] as const)("stripCurrencyMarks rejects a contradicting or negative amount (case %#)", (raw, currency, message) => {
    const r = stripCurrencyMarks(raw, currency);
    expect("error" in r ? r.error : "").toContain(message);
  });
});
