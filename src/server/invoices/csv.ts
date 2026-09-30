import Papa from "papaparse";
import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import { isValidEmail, normalizeEmail } from "@/lib/email-address";
import {
  DATE_FORMATS,
  FIELD_LABELS,
  INVOICE_FIELDS,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  type CsvInspection,
  type DateFormat,
  type InvoiceField,
} from "@/lib/import-fields";
import { isSupportedCurrency, parseAmountToMinor } from "@/lib/money";

export {
  DATE_FORMATS,
  FIELD_LABELS,
  INVOICE_FIELDS,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  type CsvInspection,
  type DateFormat,
  type InvoiceField,
};

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 2000;

const KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

const DATE_FORMAT_EXAMPLE: Record<DateFormat, string> = {
  ymd: "YYYY-MM-DD (2026-03-31)",
  dmy: "DD/MM/YYYY (31/03/2026)",
  mdy: "MM/DD/YYYY (03/31/2026)",
};

/** Maps a file whose columns do not use CashPilot's names. Chosen by the user; never guessed silently. */
export interface ColumnMapping {
  /** Field → header exactly as it appears in the file. */
  columns: Partial<Record<InvoiceField, string>>;
  dateFormat: DateFormat;
  /** Applied to every row when the file has no currency column. */
  defaultCurrency?: string;
}

export const columnMappingSchema = z.object({
  columns: z.partialRecord(z.enum(INVOICE_FIELDS as [InvoiceField, ...InvoiceField[]]), z.string().max(200)),
  dateFormat: z.enum(DATE_FORMATS),
  defaultCurrency: z.string().max(3).optional(),
});

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

export type CsvInspectResult =
  | { ok: true; canonical: boolean; inspection: CsvInspection }
  | { ok: false; errors: ImportRowError[] };

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

/** Keeps the header as the user sees it in their spreadsheet. */
function cleanHeader(h: string): string {
  return h.replace(/^﻿/, "").replace(CONTROL_CHARS, "").trim();
}

const MAX_ERRORS = 100;

function readCsv(text: string, transformHeader: (h: string) => string) {
  if (text.includes("\u0000")) {
    return { ok: false as const, errors: [{ line: 0, message: "The file is not a text CSV file." }] };
  }
  if (!text.trim()) {
    return { ok: false as const, errors: [{ line: 0, message: "The file is empty." }] };
  }
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader });
  return { ok: true as const, parsed };
}

function rowCountError(count: number): ImportRowError | null {
  if (count === 0) return { line: 0, message: "The file has a header but no invoice rows." };
  if (count > MAX_CSV_ROWS) return { line: 0, message: `Too many rows (${count}). The limit is ${MAX_CSV_ROWS} per file.` };
  return null;
}

/**
 * Parse an invoice CSV. Without a mapping the file must use CashPilot's column names and ISO dates.
 * With a mapping (confirmed by the user) columns are read by their original names, and common
 * accounting-export date and amount formats are accepted.
 */
export function parseInvoiceCsv(text: string, mapping?: ColumnMapping): CsvParseResult {
  return mapping ? parseMapped(text, mapping) : parseCanonical(text);
}

function parseCanonical(text: string): CsvParseResult {
  const warnings: string[] = [];
  const read = readCsv(text, normalizeHeader);
  if (!read.ok) return { ...read, warnings };
  const { parsed } = read;

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

  const countError = rowCountError(parsed.data.length);
  if (countError) return { ok: false, errors: [countError], warnings };

  return validateRows(parsed, {
    value: (raw, field) => raw[field],
    label: (field) => field,
    strict: true,
    dateFormat: "ymd",
    warnings,
  });
}

function parseMapped(text: string, mapping: ColumnMapping): CsvParseResult {
  const warnings: string[] = [];
  const read = readCsv(text, cleanHeader);
  if (!read.ok) return { ...read, warnings };
  const { parsed } = read;
  const headers = parsed.meta.fields ?? [];

  const columns: Partial<Record<InvoiceField, string>> = {};
  for (const field of INVOICE_FIELDS) {
    const h = mapping.columns[field]?.trim();
    if (h) columns[field] = h;
  }
  const defaultCurrency = mapping.defaultCurrency?.trim().toUpperCase() || undefined;

  const fileErrors: ImportRowError[] = [];
  const notInFile = Object.values(columns).filter((h) => !headers.includes(h));
  if (notInFile.length > 0) fileErrors.push({ line: 1, message: `Column not found in the file: ${notInFile.join(", ")}.` });
  const used = Object.values(columns);
  const reused = used.filter((h, i) => used.indexOf(h) !== i);
  if (reused.length > 0) {
    fileErrors.push({ line: 1, message: `Each column can only be used once: ${[...new Set(reused)].join(", ")}.` });
  }
  const unmapped = REQUIRED_COLUMNS.filter((f) => !columns[f] && !(f === "currency" && defaultCurrency));
  if (unmapped.length > 0) {
    fileErrors.push({ line: 1, message: `Choose a column for: ${unmapped.map((f) => FIELD_LABELS[f]).join(", ")}.` });
  }
  if (!columns.currency && defaultCurrency && !isSupportedCurrency(defaultCurrency)) {
    fileErrors.push({ line: 1, message: `"${defaultCurrency}" is not a recognised ISO currency code.` });
  }
  if (fileErrors.length > 0) return { ok: false, errors: fileErrors, warnings };

  const ignored = headers.filter((h) => h && !used.includes(h));
  if (ignored.length > 0) warnings.push(`Ignored column(s) not used by CashPilot: ${ignored.join(", ")}.`);

  const countError = rowCountError(parsed.data.length);
  if (countError) return { ok: false, errors: [countError], warnings };

  return validateRows(parsed, {
    value: (raw, field) => {
      const header = columns[field];
      if (header) return raw[header];
      return field === "currency" ? defaultCurrency : "";
    },
    label: (field) => columns[field] ?? (field === "currency" ? "currency (for all rows)" : field),
    strict: false,
    dateFormat: mapping.dateFormat,
    warnings,
  });
}

interface RowReader {
  value: (raw: Record<string, string>, field: InvoiceField) => string | undefined;
  /** Column name shown in error messages. */
  label: (field: InvoiceField) => string;
  /** Strict: ISO dates and plain amounts only (CashPilot's own format). */
  strict: boolean;
  dateFormat: DateFormat;
  warnings: string[];
}

function validateRows(parsed: Papa.ParseResult<Record<string, string>>, reader: RowReader): CsvParseResult {
  const { warnings } = reader;
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
    const err = (field: InvoiceField, message: string) => rowErrors.push({ line, column: reader.label(field), message });
    const get = (field: InvoiceField) => reader.value(raw, field);

    const customerName = cleanText(get("customer_name"));
    const customerEmail = normalizeEmail(cleanText(get("customer_email")));
    const invoiceNumber = cleanText(get("invoice_number"));
    const invoiceDateRaw = cleanText(get("invoice_date"));
    const dueDateRaw = cleanText(get("due_date"));
    const amountRaw = cleanText(get("amount"));
    const currency = cleanText(get("currency")).toUpperCase();
    const accountManager = cleanText(get("account_manager"));
    const notes = cleanText(get("notes"), { multiline: true });

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

    const readDate = (field: InvoiceField, v: string): string | null => {
      if (!v) {
        err(field, "Date is required.");
        return null;
      }
      if (reader.strict) {
        if (isValidIsoDate(v)) return v;
        err(field, `"${v}" is not a valid date. Use YYYY-MM-DD, e.g. 2026-03-31.`);
        return null;
      }
      const iso = parseFlexibleDate(v, reader.dateFormat);
      if (!iso) err(field, `"${v}" is not a valid date. Expected ${DATE_FORMAT_EXAMPLE[reader.dateFormat]} or a date like 31 Mar 2026.`);
      return iso;
    };
    const invoiceDate = readDate("invoice_date", invoiceDateRaw);
    const dueDate = readDate("due_date", dueDateRaw);
    if (invoiceDate && dueDate && dueDate < invoiceDate) err("due_date", "Due date is before the invoice date.");

    let currencyOk = false;
    if (!currency) err("currency", "Currency is required (3-letter code such as USD, EUR, GBP).");
    else if (!isSupportedCurrency(currency)) err("currency", `"${currency}" is not a recognised ISO currency code.`);
    else currencyOk = true;

    let amountMinor: number | null = null;
    if (!amountRaw) err("amount", "Amount is required.");
    else if (currencyOk) {
      const cleaned = reader.strict ? { value: amountRaw } : stripCurrencyMarks(amountRaw, currency);
      if ("error" in cleaned) err("amount", cleaned.error);
      else {
        amountMinor = parseAmountToMinor(cleaned.value, currency);
        if (amountMinor === null) {
          err("amount", `"${amountRaw}" is not a valid amount for ${currency}. Use digits and a decimal point, e.g. 1250.00.`);
        } else if (amountMinor <= 0) {
          err("amount", "Amount must be greater than zero.");
        }
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
      invoiceDate: invoiceDate!,
      dueDate: dueDate!,
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

// --- Column matching -------------------------------------------------------------------------

/**
 * Common column names in accounting and spreadsheet exports, most specific first.
 * Compared after lower-casing and removing everything except letters and digits.
 * For the amount, the balance still owed is preferred over the invoice total.
 */
const HEADER_ALIASES: Record<InvoiceField, string[]> = {
  customer_name: ["customername", "customer", "contactname", "contact", "clientname", "client", "companyname", "company", "billto", "name"],
  customer_email: ["customeremail", "emailaddress", "email", "contactemail", "billingemail", "clientemail", "customeremailaddress"],
  invoice_number: ["invoicenumber", "invoiceno", "invoicenum", "invoice", "invoiceid", "num", "number", "no", "docnumber", "documentnumber"],
  invoice_date: ["invoicedate", "date", "issuedate", "dateissued", "issued", "transactiondate", "txndate"],
  due_date: ["duedate", "datedue", "paymentduedate", "paymentdue", "due"],
  amount: [
    "amount",
    "amountdue",
    "invoiceamountdue",
    "balancedue",
    "openbalance",
    "balance",
    "amountoutstanding",
    "outstanding",
    "total",
    "invoicetotal",
    "totalamount",
    "invoiceamount",
  ],
  currency: ["currency", "currencycode", "ccy", "curr"],
  account_manager: ["accountmanager", "accountowner", "salesperson", "salesrep", "rep", "owner"],
  notes: ["notes", "note", "memo", "comments", "comment"],
};

function aliasKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestMapping(headers: string[]): Partial<Record<InvoiceField, string>> {
  const used = new Set<string>();
  const out: Partial<Record<InvoiceField, string>> = {};
  for (const field of INVOICE_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      const h = headers.find((x) => !used.has(x) && aliasKey(x) === alias);
      if (h) {
        out[field] = h;
        used.add(h);
        break;
      }
    }
  }
  return out;
}

/** Reads headers and samples so the user can confirm how the file's columns map to invoice fields. */
export function inspectCsv(text: string): CsvInspectResult {
  const read = readCsv(text, cleanHeader);
  if (!read.ok) return read;
  const { parsed } = read;
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const countError = rowCountError(parsed.data.length);
  if (countError) return { ok: false, errors: [countError] };

  const normalized = headers.map(normalizeHeader);
  const canonical = REQUIRED_COLUMNS.every((c) => normalized.includes(c));
  const suggested = suggestMapping(headers);

  const samples: Record<string, string> = {};
  for (const h of headers) {
    const v = parsed.data.map((r) => cleanText(r[h])).find(Boolean);
    if (v) samples[h] = v.length > 60 ? `${v.slice(0, 57)}…` : v;
  }

  const dateValues = [suggested.invoice_date, suggested.due_date]
    .filter((h): h is string => Boolean(h))
    .flatMap((h) => parsed.data.map((r) => cleanText(r[h])));
  return {
    ok: true,
    canonical,
    inspection: { headers, rowCount: parsed.data.length, suggested, samples, dateFormat: detectDateFormat(dateValues) },
  };
}

// --- Dates -----------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const YMD_DATE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/;
const DAY_MONTH_NAME = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{4})$/;
const MONTH_NAME_DAY = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/;

function isoFrom(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Converts a date in the given order (or an unambiguous ISO / month-name date) to YYYY-MM-DD. */
export function parseFlexibleDate(value: string, format: DateFormat): string | null {
  const v = value.trim().replace(/T00:00(:00(\.0+)?)?Z?$/, "");
  let m = YMD_DATE.exec(v);
  if (m) return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = DAY_MONTH_NAME.exec(v))) {
    const month = MONTHS[m[2]!.toLowerCase()];
    return month ? isoFrom(Number(m[3]), month, Number(m[1])) : null;
  }
  if ((m = MONTH_NAME_DAY.exec(v))) {
    const month = MONTHS[m[1]!.toLowerCase()];
    return month ? isoFrom(Number(m[3]), month, Number(m[2])) : null;
  }
  if ((m = NUMERIC_DATE.exec(v))) {
    if (format === "dmy") return isoFrom(Number(m[3]), Number(m[2]), Number(m[1]));
    if (format === "mdy") return isoFrom(Number(m[3]), Number(m[1]), Number(m[2]));
  }
  return null;
}

/**
 * Decides whether numeric dates are day-first or month-first from values that can only be read
 * one way (e.g. 31/03/2026). Returns null when every value fits both orders, or the values conflict,
 * so the user has to choose; "ymd" when there are no numeric dates to interpret.
 */
export function detectDateFormat(values: string[]): DateFormat | null {
  let numeric = false;
  let dayFirst = false;
  let monthFirst = false;
  for (const v of values) {
    const m = NUMERIC_DATE.exec(v.trim());
    if (!m) continue;
    numeric = true;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (!numeric) return "ymd";
  if (dayFirst && !monthFirst) return "dmy";
  if (monthFirst && !dayFirst) return "mdy";
  return null;
}

// --- Amounts ---------------------------------------------------------------------------------

const CURRENCY_SYMBOLS: [string, string[]][] = [
  ["US$", ["USD"]],
  ["NZ$", ["NZD"]],
  ["HK$", ["HKD"]],
  ["A$", ["AUD"]],
  ["C$", ["CAD"]],
  ["S$", ["SGD"]],
  ["$", ["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN"]],
  ["£", ["GBP"]],
  ["€", ["EUR"]],
  ["¥", ["JPY", "CNY"]],
  ["₹", ["INR"]],
];

/**
 * Removes a currency symbol or code from an exported amount ("$4,250.00", "4250.00 GBP"),
 * refusing ones that contradict the invoice currency so money is never mislabelled.
 */
export function stripCurrencyMarks(raw: string, currency: string): { value: string } | { error: string } {
  let v = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith("-")) {
    negative = true;
    v = v.slice(1).trim();
  }

  let code: string | undefined;
  let m = /^([A-Za-z]{3})\s*(?=[\d$£€¥₹.-])/.exec(v);
  if (m) {
    code = m[1];
    v = v.slice(m[0].length);
  } else if ((m = /\s*([A-Za-z]{3})$/.exec(v))) {
    code = m[1];
    v = v.slice(0, m.index);
  }
  if (code && code.toUpperCase() !== currency) {
    return { error: `"${raw}" is in ${code.toUpperCase()}, but this invoice's currency is ${currency}.` };
  }

  for (const [symbol, codes] of CURRENCY_SYMBOLS) {
    const atStart = v.startsWith(symbol);
    if (!atStart && !v.endsWith(symbol)) continue;
    if (!codes.includes(currency)) {
      return { error: `"${raw}" uses ${symbol}, but this invoice's currency is ${currency}.` };
    }
    v = (atStart ? v.slice(symbol.length) : v.slice(0, -symbol.length)).trim();
    break;
  }
  if (v.startsWith("-")) negative = true;
  if (negative) return { error: "Amount must be greater than zero. Credits and refunds are not imported." };
  return { value: v };
}
