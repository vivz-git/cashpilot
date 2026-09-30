# Positioning Hypotheses

**These are hypotheses to test, not a claimed product-market fit.** No customer has validated any positioning angle below.

## Working positioning statement

> CashPilot — AI-powered accounts receivable for businesses — prioritize overdue invoices, draft follow-ups, and get paid faster without damaging client relationships.

## The differentiation problem (must be tested directly)

As of 2026-09-29, both major incumbents already do "AI drafts a reminder, human approves it":

- **QuickBooks (Intuit Payments AI):** drafts context-specific, personalized invoice reminders based on days overdue, customer name, invoice number and due date, and proposes a follow-up schedule for approval before anything sends. Intuit's own marketing claims users get paid ~4–5 days faster on average and overdue invoices are ~10% more likely to be paid in full — these are vendor-reported figures, not independently verified. ([QuickBooks blog, Aug 2026](https://quickbooks.intuit.com/r/product-update/whats-new-quickbooks-online-august-2026/); [QuickBooks Payments AI help](https://quickbooks.intuit.com/learn-support/en-us/help-article/intuit-assist/get-started-payments-agent/L0FyKj9NL_US_en_US); [QuickBooks AI Payments Agent page](https://quickbooks.intuit.com/payments-agent/))
- **Xero (JAX — "Just Ask Xero"):** JAX builds a per-customer follow-up plan from payment history (channel, cadence, timing) and "chases overdue invoices" automatically, adapting the communication method if a customer doesn't respond, and can predict when a customer will pay. ([Xero AI in accounting](https://www.xero.com/au/ai-in-accounting/); [Accounting Today, Xerocon 2026 coverage](https://www.accountingtoday.com/news/xerocon-2026-jax-ai-improvements-focused-on-automating-unbillable-admin-work); [TechRepublic, JAX payment prediction](https://www.techrepublic.com/article/xero-jax-significant-updates/))

**Conclusion: "AI drafts a reminder and a human approves it" is not, by itself, a defensible differentiator.** Both incumbents already ship this, are already embedded in the accounting system of record, and have distribution CashPilot doesn't have. See [competitive_landscape.md](competitive_landscape.md) for the fuller comparison.

## What's left to test as differentiation

Not "we have AI reminders" but whether the target segment values, specifically:

1. **Triage/prioritization** — not just "this is overdue" but "this is the one that matters most right now, and why."
2. **Understanding *why* an invoice isn't paid** — dispute, PO delay, promised date, no response — vs. incumbents' focus on *when* to nudge and *how*.
3. **Promise-to-pay tracking** — remembering and acting on what a client actually said, not just calendar-based follow-up cadence.
4. **Dispute/context tracking** — so a disputed invoice isn't chased the same way as a simply-late one (this is a CashPilot product decision already — see [DECISIONS.md](../DECISIONS.md) D33, D52).
5. **Relationship-safe next action** — explicit guardrails against threatening/guilt-based language (see [DECISIONS.md](../DECISIONS.md) D35, [SECURITY_REVIEW.md](../SECURITY_REVIEW.md)), aimed at agencies that fear damaging client relationships (hypothesis H4 in [customer_discovery_guide.md](customer_discovery_guide.md)) more than at maximizing collection rate.
6. **Account context for finance/admin teams** — closing the gap where "finance lacks account context" (hypothesis H1) even though incumbents already track payment history, because incumbents don't necessarily surface *why* a specific account is behaving differently.

## How to test this (not before segment validation)

Once [validation_metrics.md](validation_metrics.md)'s bar is met, discovery conversations should probe reaction to items 1–6 above specifically, and explicitly ask whether QuickBooks/Xero's existing reminder AI already feels sufficient — a "yes, that's enough" answer is disconfirming for this positioning, not something to argue past.

## Explicit non-claims

- No claim that CashPilot has product-market fit.
- No claim that any of items 1–6 above have been validated as wanted by the target segment.
- No claim that CashPilot's approach outperforms QuickBooks/Xero — none of that has been measured.
