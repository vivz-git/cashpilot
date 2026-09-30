import type { CustomerSituation, Tone } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { toPlainText } from "@/lib/text";
import type { DraftOutput } from "./types";

/** Facts given to the drafting model (and the template). */
export interface DraftFacts {
  invoice_number: string;
  amount: string;
  invoice_date: string;
  due_date: string;
  days_overdue: number;
  follow_ups_sent: number;
  promise_to_pay_date: string | null;
  customer_situation: CustomerSituation;
  tone: Tone;
  sender_name: string;
  organization_name: string;
}

export interface DraftContext {
  facts: DraftFacts;
  untrusted_text: {
    customer_name: string;
    invoice_notes: string | null;
    recent_activity: { date: string; type: string; text: string }[];
  };
}

/** A safe, human-written template used when the model is unavailable or its draft fails checks. */
export function templateDraft(ctx: DraftContext): DraftOutput {
  const f = ctx.facts;
  const ref = `invoice ${f.invoice_number} for ${f.amount} (issued ${formatDate(f.invoice_date)}, due ${formatDate(f.due_date)})`;
  const signOff = `Kind regards,\n${f.sender_name}\n${f.organization_name}`;
  let subject = `Invoice ${f.invoice_number} – payment reminder`;
  let middle: string;

  switch (f.customer_situation) {
    case "dispute":
      subject = `Invoice ${f.invoice_number} – resolving your concerns`;
      middle = `Thank you for raising your concerns about ${ref}. We want to make sure this is resolved properly.\n\nWould you be available for a short call this week to go through it together? Please let me know a time that suits you.`;
      break;
    case "promised_payment":
      subject = `Invoice ${f.invoice_number} – checking in`;
      middle = `Thank you for letting us know that payment for ${ref} was planned${f.promise_to_pay_date ? ` for ${formatDate(f.promise_to_pay_date)}` : ""}. We have not seen it arrive yet.\n\nCould you confirm whether it has been sent, or let me know an updated payment date?`;
      break;
    case "invoice_not_received":
      subject = `Invoice ${f.invoice_number} – details`;
      middle = `It is possible ${ref} did not reach the right person, so here are the details again.\n\nCould you confirm it has reached your accounts payable team and let me know when we can expect payment?`;
      break;
    case "payment_processing":
      subject = `Invoice ${f.invoice_number} – expected payment date`;
      middle = `Thank you for processing ${ref}.\n\nCould you let me know the expected payment date once it is scheduled?`;
      break;
    case "cash_flow_issue":
      subject = `Invoice ${f.invoice_number} – finding a way forward`;
      middle = `I am following up on ${ref}. We understand timing can be difficult.\n\nCould you let me know what payment date would be realistic for you, so we can plan accordingly?`;
      break;
    default:
      middle =
        f.follow_ups_sent === 0
          ? `I hope all is well. This is a friendly reminder that ${ref} is now outstanding.\n\nCould you let me know when we can expect payment, or if you need anything from us to process it, such as a copy of the invoice or a PO number?`
          : `I am following up on ${ref}, which is still outstanding on our side.\n\nCould you let me know the expected payment date, or whether anything is holding it up?`;
  }

  const closing =
    f.customer_situation === "dispute" ? "" : "\n\nIf payment has already been sent, thank you, and please disregard this note.";
  return { subject, body: `Hello,\n\n${middle}${closing}\n\n${signOff}` };
}

// --- Safety checks ---------------------------------------------------------

const THREAT_PATTERNS: [RegExp, string][] = [
  [/\blegal (action|proceedings|steps|team|remedies)\b/i, "mentions legal action"],
  [/\b(lawyers?|attorneys?|solicitors?|counsel)\b/i, "mentions lawyers"],
  [/\b(court|lawsuit|litigation|sue|suing|small claims|tribunal|bailiffs?)\b/i, "mentions court or lawsuits"],
  [/\b(collections? agency|debt collect(or|ion)|collection agency|recovery agency)\b/i, "mentions debt collection"],
  [/\bcredit (score|rating|report|bureau|reference)\b/i, "mentions credit rating"],
  [/\b(late (payment )?fees?|interest charges?|penalt(y|ies)|surcharge)\b/i, "mentions fees, interest or penalties"],
  [/\bfinal (notice|warning|demand|reminder)\b/i, "uses 'final notice' language"],
  [/\b(breach of contract|legally (obliged|bound|required)|statutory)\b/i, "makes a legal claim"],
  [/\b(or else|consequences|we will be forced|no choice but|suspend (all )?(work|services?)|cut off)\b/i, "contains a threat"],
  [/\b(immediately|within 24 hours|urgent(ly)?|asap)\b/i, "applies pressure ('immediately', 'urgent')"],
];

const GUILT_PATTERNS: [RegExp, string][] = [
  [/\b(disappoint(ed|ing)|let (us|me) down|frustrat(ed|ing))\b/i, "guilt-trips the customer"],
  [/\b(you promised|broke (your|the) promise|trusted you|we trusted)\b/i, "blames the customer for a broken promise"],
  [/\b(ashamed|shame|how could you|unacceptable|unprofessional|irresponsible)\b/i, "uses shaming language"],
  [/\b(we are|we're) (struggling|a small business)|small business like ours|pay (our|my) (staff|bills|rent)\b/i, "uses emotional pressure"],
  [/\bignor(ed|ing) (us|our|my)\b/i, "accuses the customer of ignoring us"],
];

export interface SafetyIssue {
  code: "threat" | "guilt" | "missing_invoice" | "link" | "unknown_number" | "too_long" | "html" | "placeholder";
  message: string;
}

/**
 * Checks a draft against the relationship-safety rules. Used to reject model
 * output and to warn a human editing a draft.
 */
export function checkDraftSafety(
  draft: DraftOutput,
  facts: Pick<DraftFacts, "invoice_number" | "amount">,
): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  const text = `${draft.subject}\n${draft.body}`;

  for (const [re, msg] of THREAT_PATTERNS) {
    if (re.test(text)) issues.push({ code: "threat", message: `Draft ${msg}.` });
  }
  for (const [re, msg] of GUILT_PATTERNS) {
    if (re.test(text)) issues.push({ code: "guilt", message: `Draft ${msg}.` });
  }
  if (!text.toLowerCase().includes(facts.invoice_number.toLowerCase())) {
    issues.push({ code: "missing_invoice", message: `Draft does not mention invoice ${facts.invoice_number}.` });
  }
  if (/(https?:\/\/|www\.)\S+/i.test(text)) {
    issues.push({ code: "link", message: "Draft contains a link. Check it is genuine before sending." });
  }
  if (/<\/?[a-z][^>]*>/i.test(text)) {
    issues.push({ code: "html", message: "Draft contains HTML. Emails are sent as plain text." });
  }
  if (/\[[A-Z][A-Za-z ]{1,30}\]|\{\{.*?\}\}/.test(text)) {
    issues.push({ code: "placeholder", message: "Draft contains an unfilled placeholder." });
  }
  // Long digit runs that are not part of the invoice number could be invented bank or phone details.
  const withoutKnown = text
    .replace(new RegExp(escapeRegExp(facts.invoice_number), "gi"), "")
    .replace(new RegExp(escapeRegExp(facts.amount), "g"), "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  if (/\d[\d\s-]{6,}\d/.test(withoutKnown)) {
    issues.push({
      code: "unknown_number",
      message: "Draft contains a long number (possible bank, account or phone details). Verify it before sending.",
    });
  }
  const words = draft.body.split(/\s+/).filter(Boolean).length;
  if (words > 220) issues.push({ code: "too_long", message: `Draft is long (${words} words). Keep it concise.` });
  return issues;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HEADER_UNSAFE = /[\r\n\u0000-\u001F\u007F]+/g;

/** Normalise a draft to safe plain text: no tags, no control chars, single-line subject. */
export function sanitizeDraft(draft: DraftOutput): DraftOutput {
  return {
    subject: toPlainText(draft.subject).replace(HEADER_UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, 200),
    body: toPlainText(draft.body.replace(/\r\n?/g, "\n"))
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, 5000),
  };
}
