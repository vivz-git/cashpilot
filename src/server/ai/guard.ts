import type { CustomerSituation } from "@/db/schema";
import { toPlainText } from "@/lib/text";
import { evidenceCorpus, normalizeForMatch, type AnalysisContext } from "./context";
import {
  baselinePriority,
  defaultAction,
  factualSituation,
  noResponseIsSupported,
  PRIORITY_TOLERANCE,
  ruleBasedAnalysis,
} from "./rules";
import type { AnalysisOutput } from "./types";

/** Situations that can only come from something the customer said or a note recorded. */
const EVIDENCE_REQUIRED: ReadonlySet<CustomerSituation> = new Set([
  "promised_payment",
  "invoice_not_received",
  "payment_processing",
  "dispute",
  "cash_flow_issue",
]);

const MIN_EVIDENCE_LENGTH = 8;

export { toPlainText };

function stripQuotes(s: string): string {
  return s.replace(/^["'“‘\s]+|["'”’\s.]+$/g, "");
}

export interface GuardResult {
  output: AnalysisOutput;
  notes: string[];
}

/**
 * Enforce "never invent information" in code: verify quoted evidence exists,
 * let recorded facts override the model, and bound the priority score.
 */
export function applyAnalysisGuards(raw: AnalysisOutput, ctx: AnalysisContext): GuardResult {
  const notes: string[] = [];
  const out: AnalysisOutput = {
    ...raw,
    reason: toPlainText(raw.reason),
    recommended_action: toPlainText(raw.recommended_action),
    missing_information: [...new Set(raw.missing_information.map(toPlainText).filter(Boolean))],
    evidence: [],
  };

  // 1. Evidence must be quoted verbatim from the invoice's notes or activity log.
  const corpus = evidenceCorpus(ctx);
  const verified: string[] = [];
  let dropped = 0;
  for (const quote of raw.evidence) {
    const q = normalizeForMatch(stripQuotes(toPlainText(quote)));
    if (q.length >= MIN_EVIDENCE_LENGTH && corpus.includes(q)) verified.push(stripQuotes(toPlainText(quote)));
    else dropped += 1;
  }
  out.evidence = verified;
  if (dropped > 0) {
    notes.push(`Removed ${dropped} evidence quote(s) that do not appear in the invoice notes or activity.`);
  }

  // 2. Recorded facts override the model.
  const factual = factualSituation(ctx);
  const fallback = ruleBasedAnalysis(ctx);
  let downgraded = false;
  if (factual) {
    if (out.customer_situation !== factual) {
      notes.push(`Situation set to "${factual}" from recorded data (model said "${out.customer_situation}").`);
      out.customer_situation = factual;
      out.recommended_action = defaultAction(ctx, factual);
    }
    // Never recommend chasing payment on a disputed invoice.
    if (factual === "dispute") out.recommended_action = defaultAction(ctx, "dispute");
  } else if (out.customer_situation === "no_response" && !noResponseIsSupported(ctx)) {
    notes.push(
      ctx.facts.follow_ups_sent === 0
        ? 'Model said "no_response" but no reminder has been sent yet.'
        : 'Model said "no_response" but the customer has replied since the last reminder.',
    );
    downgraded = true;
  } else if (EVIDENCE_REQUIRED.has(out.customer_situation) && verified.length === 0) {
    notes.push(`Model said "${out.customer_situation}" without verifiable evidence; set to "unknown".`);
    downgraded = true;
  }

  if (downgraded) {
    out.customer_situation = "unknown";
    out.confidence = "low";
    out.reason = fallback.reason;
    out.recommended_action = defaultAction(ctx, "unknown");
    out.recommended_tone = fallback.recommended_tone;
    for (const m of fallback.missing_information) {
      if (!out.missing_information.includes(m)) out.missing_information.push(m);
    }
  }

  if (out.customer_situation === "unknown") {
    if (out.confidence !== "low") notes.push('Confidence lowered to "low" because the situation is unknown.');
    out.confidence = "low";
    if (out.missing_information.length === 0) out.missing_information.push(...fallback.missing_information);
  }

  // 3. Priority must stay close to the fact-based baseline.
  const base = baselinePriority(ctx);
  const lo = Math.max(1, base - PRIORITY_TOLERANCE);
  const hi = Math.min(10, base + PRIORITY_TOLERANCE);
  if (out.priority_score < lo || out.priority_score > hi) {
    const clamped = Math.min(hi, Math.max(lo, out.priority_score));
    notes.push(`Priority adjusted from ${out.priority_score} to ${clamped} (allowed range ${lo}–${hi} from invoice facts).`);
    out.priority_score = clamped;
  }

  out.missing_information = out.missing_information.slice(0, 10);
  return { output: out, notes };
}

/**
 * Human judgement needed before any contact (DECISIONS.md D37): disputes,
 * cash-flow problems, and cases where we have already chased and still do
 * not know what is going on. A first reminder on an unexplained overdue
 * invoice is routine and does not need escalation.
 */
export function needsHumanReview(a: {
  customerSituation: string | null;
  followUpCount: number;
}): boolean {
  return (
    a.customerSituation === "dispute" ||
    a.customerSituation === "cash_flow_issue" ||
    (a.customerSituation === "unknown" && a.followUpCount > 0)
  );
}
