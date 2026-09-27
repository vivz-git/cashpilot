import Papa from "papaparse";
import { isValidIsoDate } from "@/lib/dates";
import { isValidEmail, normalizeEmail } from "@/lib/email-address";
import { isSupportedCurrency, parseAmountToMinor } from "@/lib/money";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 2000;

export const REQUIRED_COLUMNS = [
  "customer_name",
  "customer_email",
  "invoice_number",
  "invoice_date",
  "due_date",
  "amount",
  "currency",
] as const;
export const OPTIONAL_COLUMNS = ["account_manager", "notes"] as const;
const KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

export interface ImportRowError {
  /** Line number in the file (header is line 1). 0 for file-level errors. */
  line: number;
  column?: string;
  message: string;
}

export interface ParsedInvoiceRow {
  line: number;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountMinor: number;
  currency: string;
  accountManager: string | null;
  notes: string | null;
}

export type CsvParseResult =
  | { ok: true; rows: ParsedInvoiceRow[]; warnings: string[] }
  | { ok: false; errors: ImportRowError[]; warnings: string[] };

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(value: string | undefined, { multiline = false } = {}): string {
  let v = (value ?? "").replace(CONTROL_CHARS, "");
  if (!multiline) v = v.replace(/[\r\n\t]+/g, " ");
  return v.trim();
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const MAX_ERRORS = 100;

export function parseInvoiceCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  if (text.includes("\u0000")) {
    return { ok: false, errors: [{ line: 0, message: "The file is not a text CSV file." }], warnings };
  }
  if (!text.trim()) {
    return { ok: false, errors: [{ line: 0, message: "The file is empty." }], warnings };
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected columns: ${[
            ...REQUIRED_COLUMNS,
            ...OPTIONAL_COLUMNS,
          ].join(", ")}.`,
        },
      ],
      warnings,
    };
  }
  const dupHeaders = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (dupHeaders.length > 0) {
    return {
      ok: false,
      errors: [{ line: 1, message: `Duplicate column: ${[...new Set(dupHeaders)].join(", ")}.` }],
      warnings,
    };
  }
  const unknown = headers.filter((h) => h && !KNOWN_COLUMNS.has(h));
  if (unknown.length > 0) warnings.push(`Ignored unknown column(s): ${unknown.join(", ")}.`);

  if (parsed.data.length === 0) {
    return { ok: false, errors: [{ line: 0, message: "The file has a header but no invoice rows." }], warnings };
  }
  if (parsed.data.length > MAX_CSV_ROWS) {
    return {
      ok: false,
      errors: [{ line: 0, message: `Too many rows (${parsed.data.length}). The limit is ${MAX_CSV_ROWS} per file.` }],
      warnings,
    };
  }

  const errors: ImportRowError[] = [];
  // Papaparse row index → file line (header is line 1). Quoted multi-line cells make this approximate,
  // so we prefer the parser's own row reference when it gives one.
  for (const e of parsed.errors) {
    const line = typeof e.row === "number" ? e.row + 2 : 0;
    const message =
      e.code === "TooManyFields"
        ? "Row has more values than there are columns (check for unquoted commas)."
        : e.code === "TooFewFields"
          ? "Row has fewer values than there are columns."
          : e.code === "MissingQuotes" || e.code === "InvalidQuotes"
            ? "Malformed quotes in this row."
            : e.message;
    errors.push({ line, message });
  }

  const rows: ParsedInvoiceRow[] = [];
  const seenNumbers = new Map<string, number>();

  parsed.data.forEach((raw, idx) => {
    const line = idx + 2;
    const rowErrors: ImportRowError[] = [];
    const err = (column: string, message: string) => rowErrors.push({ line, column, message });

    const customerName = cleanText(raw.customer_name);
    const customerEmail = normalizeEmail(cleanText(raw.customer_email));
    const invoiceNumber = cleanText(raw.invoice_number);
    const invoiceDate = cleanText(raw.invoice_date);
    const dueDate = cleanText(raw.due_date);
    const amountRaw = cleanText(raw.amount);
    const currency = cleanText(raw.currency).toUpperCase();
    const accountManager = cleanText(raw.account_manager);
    const notes = cleanText(raw.notes, { multiline: true });

    if (!customerName) err("customer_name", "Customer name is required.");
    else if (customerName.length > 200) err("customer_name", "Customer name is longer than 200 characters.");

    if (!customerEmail) err("customer_email", "Customer email is required.");
    else if (!isValidEmail(customerEmail)) err("customer_email", `"${customerEmail}" is not a valid email address.`);

    if (!invoiceNumber) err("invoice_number", "Invoice number is required.");
    else if (invoiceNumber.length > 64) err("invoice_number", "Invoice number is longer than 64 characters.");
    else {
      const key = invoiceNumber.toLowerCase();
      const firstLine = seenNumbers.get(key);
      if (firstLine) err("invoice_number", `Duplicate invoice number "${invoiceNumber}" (also on line ${firstLine}).`);
      else seenNumbers.set(key, line);
    }

    const dateOk = (col: string, v: string) => {
      if (!v) {
        err(col, "Date is required.");
        return false;
      }
      if (!isValidIsoDate(v)) {
        err(col, `"${v}" is not a valid date. Use YYYY-MM-DD, e.g. 2026-03-31.`);
        return false;
      }
      return true;
    };
    const invOk = dateOk("invoice_date", invoiceDate);
    const dueOk = dateOk("due_date", dueDate);
    if (invOk && dueOk && dueDate < invoiceDate) err("due_date", "Due date is before the invoice date.");

    let currencyOk = false;
    if (!currency) err("currency", "Currency is required (3-letter code such as USD, EUR, GBP).");
    else if (!isSupportedCurrency(currency)) err("currency", `"${currency}" is not a recognised ISO currency code.`);
    else currencyOk = true;

    let amountMinor: number | null = null;
    if (!amountRaw) err("amount", "Amount is required.");
    else if (currencyOk) {
      amountMinor = parseAmountToMinor(amountRaw, currency);
      if (amountMinor === null) {
        err("amount", `"${amountRaw}" is not a valid amount for ${currency}. Use digits and a decimal point, e.g. 1250.00.`);
      } else if (amountMinor <= 0) {
        err("amount", "Amount must be greater than zero.");
      }
    }

    if (accountManager.length > 100) err("account_manager", "Account manager is longer than 100 characters.");
    if (notes.length > 2000) err("notes", "Notes are longer than 2000 characters.");

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      line,
      customerName,
      customerEmail,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amountMinor: amountMinor!,
      currency,
      accountManager: accountManager || null,
      notes: notes || null,
    });
  });

  if (errors.length > 0) {
    errors.sort((a, b) => a.line - b.line);
    return { ok: false, errors: errors.slice(0, MAX_ERRORS), warnings };
  }
  return { ok: true, rows, warnings };
}
