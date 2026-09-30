import type { ActivityType, CustomerSituation } from "@/db/schema";

export const SITUATION_LABELS: Record<CustomerSituation, string> = {
  no_response: "No response",
  promised_payment: "Promised payment",
  invoice_not_received: "Invoice not received",
  payment_processing: "Payment processing",
  dispute: "Dispute",
  cash_flow_issue: "Cash-flow issue",
  unknown: "Unknown",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  invoice_imported: "Invoice imported",
  ai_analyzed: "AI analyzed",
  reminder_drafted: "Reminder drafted",
  reminder_edited: "Reminder edited",
  reminder_sent: "Reminder sent",
  reminder_failed: "Reminder failed",
  customer_replied: "Customer replied",
  payment_promised: "Payment promised",
  payment_received: "Payment received",
  dispute_created: "Dispute created",
  dispute_resolved: "Dispute resolved",
  no_response: "No response",
  note_added: "Note added",
};

export const ATTENTION_LABELS = {
  follow_up_due: "Follow-up due",
  never_contacted: "Overdue, not contacted",
  promise_broken: "Promised date passed",
} as const;
