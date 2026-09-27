import type { Confidence, CustomerSituation, Tone } from "@/db/schema";
import type { AnalysisContext } from "./context";
import type { AnalysisOutput } from "./types";

/**
 * Transparent priority baseline (1–10) from facts only. The model's score is
 * kept within ±PRIORITY_TOLERANCE of this so injected text cannot bury or
 * inflate an invoice (DECISIONS.md D36).
 */
export const PRIORITY_TOLERANCE = 3;

export function baselinePriority(ctx: AnalysisContext): number {
  const f = ctx.facts;
  if (f.status !== "open") return 1;
  let score: number;
  const d = f.days_overdue;
  if (d === 0) score = 2;
  else if (d <= 15) score = 4;
  else if (d <= 30) score = 5;
  else if (d <= 60) score = 6;
  else if (d <= 90) score = 7;
  else score = 8;

  if (f.amount_compared_to_other_open_invoices === "higher") score += 1;
  if (f.amount_compared_to_other_open_invoices === "lower") score -= 1;
  if (f.follow_ups_sent >= 2 && !f.customer_replied_since_last_reminder) score += 1;
  if (f.promise_to_pay_date) score += f.promise_to_pay_date_passed ? 1 : -2;
  return Math.min(10, Math.max(1, score));
}

/** Situation implied by recorded facts alone (null = facts do not decide it). */
export function factualSituation(ctx: AnalysisContext): CustomerSituation | null {
  const f = ctx.facts;
  if (f.dispute_status === "open") return "dispute";
  if (f.promise_to_pay_date) return "promised_payment";
  return null;
}

/** `no_response` is only true if we contacted them and heard nothing back. */
export function noResponseIsSupported(ctx: AnalysisContext): boolean {
  return ctx.facts.follow_ups_sent > 0 && !ctx.facts.customer_replied_since_last_reminder;
}

export function defaultTone(ctx: AnalysisContext, situation: CustomerSituation): Tone {
  const f = ctx.facts;
  if (situation === "dispute" || situation === "cash_flow_issue" || situation === "invoice_not_received") {
    return "friendly";
  }
  if (f.days_overdue > 60 && f.follow_ups_sent >= 3) return "firm";
  if (f.days_overdue > 30 || f.follow_ups_sent >= 2) return "neutral";
  return "friendly";
}

export function defaultAction(ctx: AnalysisContext, situation: CustomerSituation): string {
  const f = ctx.facts;
  const who = ctx.untrusted.account_manager ? `the account manager (${ctx.untrusted.account_manager})` : "the account owner";
  switch (situation) {
    case "dispute":
      return "Do not send a payment reminder. Contact the customer personally to understand and resolve the dispute.";
    case "promised_payment":
      return f.promise_to_pay_date_passed
        ? `Send a friendly check-in referencing the promised payment date (${f.promise_to_pay_date}) and ask for an updated date.`
        : `No reminder needed yet. Check for payment on the promised date (${f.promise_to_pay_date}).`;
    case "invoice_not_received":
      return "Resend the invoice details and ask the customer to confirm it reached their accounts payable team.";
    case "payment_processing":
      return "Ask the customer for the expected payment date; avoid pressure while payment is being processed.";
    case "cash_flow_issue":
      return `Have ${who} contact the customer to agree a realistic payment date.`;
    case "no_response":
      return f.follow_ups_sent >= 3
        ? `Several reminders are unanswered. Ask ${who} to call the customer rather than sending another email.`
        : "Send a polite follow-up reminder and ask for an expected payment date.";
    case "unknown":
    default:
      if (f.days_overdue === 0) return `Not yet overdue. No action needed before the due date (${f.due_date}).`;
      if (f.follow_ups_sent === 0) {
        return "Send a friendly first reminder and ask the customer to confirm they received the invoice.";
      }
      return "Review the account manually: the reason for the delay is unclear.";
  }
}

function describeFacts(ctx: AnalysisContext): string {
  const f = ctx.facts;
  const parts: string[] = [];
  parts.push(f.days_overdue > 0 ? `${f.amount} is ${f.days_overdue} days overdue` : `${f.amount} is not yet due`);
  parts.push(
    f.follow_ups_sent === 0
      ? "no reminders sent yet"
      : `${f.follow_ups_sent} reminder${f.follow_ups_sent === 1 ? "" : "s"} sent${f.customer_replied_since_last_reminder ? "" : " with no reply since the last one"}`,
  );
  if (f.dispute_status === "open") parts.push("the customer has an open dispute");
  if (f.promise_to_pay_date) {
    parts.push(
      f.promise_to_pay_date_passed
        ? `the promised payment date ${f.promise_to_pay_date} has passed`
        : `payment is promised for ${f.promise_to_pay_date}`,
    );
  }
  return parts.join("; ") + ".";
}

/** Deterministic analysis used by the mock provider and when the AI provider fails. */
export function ruleBasedAnalysis(ctx: AnalysisContext): AnalysisOutput {
  const situation: CustomerSituation =
    factualSituation(ctx) ?? (noResponseIsSupported(ctx) ? "no_response" : "unknown");
  const confidence: Confidence =
    situation === "dispute" || situation === "promised_payment" ? "high" : situation === "no_response" ? "medium" : "low";
  const missing: string[] = [];
  if (situation === "unknown") {
    missing.push(
      ctx.facts.follow_ups_sent === 0
        ? "No contact with the customer yet, so the reason for non-payment is unknown."
        : "No recorded reply or note explains why the invoice is unpaid.",
    );
  }
  if (situation === "dispute" && !ctx.untrusted.activity_log.some((a) => a.type === "dispute_created")) {
    missing.push("Details of what the customer is disputing.");
  }
  return {
    priority_score: baselinePriority(ctx),
    reason: describeFacts(ctx),
    customer_situation: situation,
    recommended_action: defaultAction(ctx, situation),
    recommended_tone: defaultTone(ctx, situation),
    confidence,
    missing_information: missing,
    evidence: [],
  };
}
