/** Invoice fields a CSV import can fill. Shared by the importer and the column-matching form. */

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

export type InvoiceField = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];
export const INVOICE_FIELDS: readonly InvoiceField[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export const FIELD_LABELS: Record<InvoiceField, string> = {
  customer_name: "Customer name",
  customer_email: "Customer email",
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  due_date: "Due date",
  amount: "Amount owed",
  currency: "Currency",
  account_manager: "Account manager",
  notes: "Notes",
};

/**
 * How to read numeric dates such as 03/04/2026. ISO (2026-04-03) and month-name dates
 * (3 Apr 2026, Apr 3, 2026) are unambiguous and always accepted with a mapping.
 */
export const DATE_FORMATS = ["ymd", "dmy", "mdy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** What the importer needs to show a column-matching step. */
export interface CsvInspection {
  headers: string[];
  rowCount: number;
  /** Best-guess mapping from common accounting-export column names. The user confirms it. */
  suggested: Partial<Record<InvoiceField, string>>;
  /** First non-empty value per header, to help the user recognise each column. */
  samples: Record<string, string>;
  /** Detected numeric date order, or null when the file's dates could be either (the user must choose). */
  dateFormat: DateFormat | null;
}
