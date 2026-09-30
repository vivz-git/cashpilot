import type { Activity, ActivityType, Invoice } from "@/db/schema";
import { daysOverdue, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** Activity types that carry evidence about the customer. AI and draft events are excluded. */
const EVIDENCE_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  "reminder_sent",
  "customer_replied",
  "payment_promised",
  "payment_received",
  "dispute_created",
  "no_response",
  "note_added",
]);

const MAX_ACTIVITIES = 20;

/** Facts we computed ourselves. Trusted. */
export interface InvoiceFacts {
  invoice_number: string;
  amount: string;
  currency: string;
  invoice_date: string;
  due_date: string;
  today: string;
  days_overdue: number;
  status: "open" | "paid";
  dispute_status: "none" | "open" | "resolved";
  promise_to_pay_date: string | null;
  promise_to_pay_date_passed: boolean;
  follow_ups_sent: number;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  customer_replied_since_last_reminder: boolean;
  amount_compared_to_other_open_invoices: "higher" | "typical" | "lower" | "unknown";
}

/** Text that originates from customers, CSV files or free-form notes. Untrusted: data, never instructions. */
export interface UntrustedText {
  customer_name: string;
  account_manager: string | null;
  invoice_notes: string | null;
  activity_log: { date: string; type: ActivityType; text: string }[];
}

export interface AnalysisContext {
  facts: InvoiceFacts;
  untrusted: UntrustedText;
}

export function buildAnalysisContext(
  invoice: Invoice,
  activities: Pick<Activity, "type" | "summary" | "createdAt">[],
  medianAmountMinor: number | null,
  now: Date = new Date(),
): AnalysisContext {
  const chronological = [...activities].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lastReminder = chronological.filter((a) => a.type === "reminder_sent").at(-1);
  const repliedSince = lastReminder
    ? chronological.some(
        (a) =>
          a.createdAt >= lastReminder.createdAt &&
          (a.type === "customer_replied" || a.type === "payment_promised" || a.type === "dispute_created"),
      )
    : false;

  let comparison: InvoiceFacts["amount_compared_to_other_open_invoices"] = "unknown";
  if (medianAmountMinor && medianAmountMinor > 0) {
    const ratio = invoice.amountMinor / medianAmountMinor;
    comparison = ratio >= 2 ? "higher" : ratio <= 0.5 ? "lower" : "typical";
  }

  const today = todayIso(now);
  return {
    facts: {
      invoice_number: invoice.invoiceNumber,
      amount: formatMoney(invoice.amountMinor, invoice.currency),
      currency: invoice.currency,
      invoice_date: invoice.invoiceDate,
      due_date: invoice.dueDate,
      today,
      days_overdue: daysOverdue(invoice.dueDate, now),
      status: invoice.status,
      dispute_status: invoice.disputeStatus,
      promise_to_pay_date: invoice.promiseToPayDate,
      promise_to_pay_date_passed: invoice.promiseToPayDate !== null && invoice.promiseToPayDate < today,
      follow_ups_sent: invoice.followUpCount,
      last_contact_date: invoice.lastContactAt ? todayIso(invoice.lastContactAt) : null,
      next_follow_up_date: invoice.nextFollowUpDate,
      customer_replied_since_last_reminder: repliedSince,
      amount_compared_to_other_open_invoices: comparison,
    },
    untrusted: {
      customer_name: invoice.customerName,
      account_manager: invoice.accountManager,
      invoice_notes: invoice.notes,
      activity_log: chronological
        .filter((a) => EVIDENCE_ACTIVITY_TYPES.has(a.type))
        .slice(-MAX_ACTIVITIES)
        .map((a) => ({ date: todayIso(a.createdAt), type: a.type, text: a.summary })),
    },
  };
}

/**
 * JSON-encode data for embedding in a prompt. `<`, `>` and `&` are escaped so
 * customer text cannot close the surrounding data tags.
 */
export function encodeForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** All untrusted text, used to verify that quoted evidence really exists. */
export function evidenceCorpus(ctx: AnalysisContext): string {
  return normalizeForMatch(
    [ctx.untrusted.invoice_notes ?? "", ...ctx.untrusted.activity_log.map((a) => a.text)].join("\n"),
  );
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
