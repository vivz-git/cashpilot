# Competitive Landscape

Research date: 2026-09-29. Facts below are marked **Verified** (from an official vendor source, fetched on the research date) or **Reported** (from a secondary source — treat as directionally useful, not confirmed). Prices and specific performance stats are vendor-published claims unless noted otherwise; none have been independently reproduced.

## Embedded incumbents (biggest competitive threat — see [positioning_hypotheses.md](positioning_hypotheses.md))

### QuickBooks (Intuit)

**Verified**, from Intuit's own pages (fetched 2026-09-29):
- "Payments AI" reviews payment patterns, drafts personalized invoice reminders (customer name, invoice number, amount, due date), and proposes a follow-up schedule — all requiring approval before sending. ([Payments AI help article](https://quickbooks.intuit.com/learn-support/en-us/help-article/intuit-assist/get-started-payments-agent/L0FyKj9NL_US_en_US), [AI Payments Agent page](https://quickbooks.intuit.com/payments-agent/))
- Invoices/payment links can be sent through Claude or ChatGPT integrations, with real-time visibility into outstanding payments. ([Aug 2026 product update](https://quickbooks.intuit.com/r/product-update/whats-new-quickbooks-online-august-2026/))

**Reported** (Intuit marketing claims, not independently verified):
- Users get paid ~4–5 days faster on average using AI-drafted reminders / the AI Payments Agent, and overdue invoices are ~10% more likely to be paid in full (basis: Intuit's own U.S. customer data, per Intuit's help documentation).

**Pricing:** bundled into existing QuickBooks plans; no separate price found for the AI reminder feature itself.

### Xero (JAX — "Just Ask Xero")

**Verified**, from Xero's own page (fetched 2026-09-29):
- JAX "chases overdue invoices" automatically in the background.
- "Payment Followups by JAX" builds a per-customer plan from payment history (how/when/how often they pay) and adapts channel/cadence per customer, switching methods if a customer doesn't respond. ([Xero AI in accounting](https://www.xero.com/au/ai-in-accounting/))

**Reported** (secondary coverage of Xerocon 2026 announcements):
- JAX has been updated to predict when a customer is likely to pay, and supports paying multiple overdue invoices at once. ([TechRepublic](https://www.techrepublic.com/article/xero-jax-significant-updates/), [Accounting Today](https://www.accountingtoday.com/news/xerocon-2026-jax-ai-improvements-focused-on-automating-unbillable-admin-work))

**Pricing:** bundled into Xero subscription; no separate price found.

### Implication

Both incumbents already ship AI-drafted, approval-gated overdue reminders, tailored to customer payment behavior. Any CashPilot pitch built solely on "AI drafts, human approves" is undifferentiated from the accounting software these prospects likely already use. See [positioning_hypotheses.md](positioning_hypotheses.md) for what to test instead.

## Standalone AR-automation vendors

### Chaser

**Verified**, from Chaser's own pricing page (fetched 2026-09-29):
- Compact: from £199/mo (~$259 USD), for <£4M annual revenue, 4 users, 30 follow-up templates.
- Core: from £599/mo (~$779 USD), for <£10M annual revenue, unlimited users.
- Complete: from £899/mo (~$1,169 USD), for <£100M annual revenue, dedicated account manager, receivables forecasting.
- Custom tier for <£100M revenue with tailored needs.
- UK-focused positioning (SMBs and accounting firms). ([chaserhq.com pricing](https://www.chaserhq.com/pricing))

### Upflow

**Verified**, from Upflow's own pricing page (fetched 2026-09-29):
- Five tiers (Starter → Enterprise) banded by annual Gross Invoice Value, from "up to $10M" to "over $100M" GIV.
- No published dollar figures — all tiers require a sales quote.
- "No seat fees" / unlimited user seats on every tier. ([upflow.io/pricing](https://upflow.io/pricing))

### Kolleno

**Verified**, from Kolleno's own pricing page (fetched 2026-09-29):
- BusinessPay: £650/user/month (£545/month billed annually), for >£1M turnover.
- Business Plus: £1,245/user/month (£995/month billed annually), for >£10M turnover.
- Enterprise / Enterprise Plus: custom pricing, for >£100M / £1Bn+ turnover.
- Priced per user; integrations/customizations may cost extra. ([kolleno.com/pricing](https://www.kolleno.com/pricing))

*Note: third-party blogs (accountsreceivable.ai, debtagent.ai) reported different Kolleno figures (~$995–$2,495/mo flat tiers). Kolleno's own page contradicts this with per-user annual/monthly pricing — the official page is treated as authoritative here.*

### Gaviti

**Reported** (no official price published as of 2026-09-29): custom-quote only; positions itself as the only AR platform bundling a zero-fee ACH payment portal in every subscription. ([gaviti.com](https://gaviti.com/))

### Tesorio

**Reported**, no official price published; one secondary source estimated a median annual contract value around $17,644 USD — this is a third-party estimate, not a Tesorio-published figure, and should not be treated as reliable.

## Segment read

None of the standalone vendors above appear to specifically target 5–30 person agencies with retainer billing and relationship-risk sensitivity (H4) — most pricing bands (revenue-tiered, per-user) target larger SMB/mid-market finance teams. This is a gap CashPilot could occupy, but it is unverified against real prospect reactions — see [validation_plan.md](validation_plan.md).
