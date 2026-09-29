# First User Journey

Walkthrough of a first-time user's path through CashPilot, annotated with friction points from [product_ux_audit.md](product_ux_audit.md). This describes the intended flow per [README.md](../README.md) and [DECISIONS.md](../DECISIONS.md); it is not a record of a real customer's actual first session — no real pilot user has been observed yet.

## 1. Sign up

Creates a new organization; the signup user becomes `owner` ([DECISIONS.md](../DECISIONS.md) D11).

- **Friction (Medium):** little explanation of what CashPilot does before asking for credentials — see audit.

## 2. Land on an empty dashboard

No invoices yet — nothing to triage.

- Not separately audited, but an empty state message pointing straight to "import invoices" would shorten time-to-value.

## 3. Import invoices via CSV

Required columns per [README.md](../README.md): `customer_name, customer_email, invoice_number, invoice_date, due_date, amount, currency`.

- **Friction (High):** any row error blocks the entire import ([DECISIONS.md](../DECISIONS.md) D23) — a first-time import of a real (messy) accounting export is the most likely place a new user hits this.
- If `AI_PROVIDER` isn't set, the app defaults to offline/mock mode.

## 4. Dashboard shows priority queue

Dashboard surfaces money outstanding, what needs attention today, and highest-priority invoices ([README.md](../README.md)).

- **Friction (Critical):** in default offline mode, analysis ignores invoice notes — a disputed or promise-dated invoice may show a generic "chase" recommendation. This is the single most important thing to fix or clearly flag before a real pilot, since it's the default experience.
- **Friction (High):** priority table doesn't adapt well to tablet/mobile.

## 5. Bulk-analyze or drill into one invoice

"Analyze outstanding" runs synchronously, capped at 25 per click ([DECISIONS.md](../DECISIONS.md) D38).

- **Friction (Medium):** no progress/cap indicator — a workspace with more than 25 open invoices won't know analysis is partial.

## 6. Draft a follow-up

AI drafts a message; unsafe wording is auto-blocked and replaced with a safe template ([DECISIONS.md](../DECISIONS.md) D35). User can edit; edits are also scanned with live warnings.

- This is a strong point per the audit — no friction noted here.

## 7. Approve & Send

The only way an email goes out; recipient is locked to the invoice record, never editable via AI output or form ([DECISIONS.md](../DECISIONS.md) D42).

- Strong point: duplicate-send prevention verified under concurrency — three concurrent Approve & Send calls produce exactly one email ([SECURITY_REVIEW.md](../SECURITY_REVIEW.md) "Email" section, [DECISIONS.md](../DECISIONS.md) D43).
- In `EMAIL_PROVIDER=mock` (default), nothing actually leaves the process — good for a pilot's first session, but the user should be told this explicitly so they don't think a real email was sent.

## 8. Record outcomes / view timeline

Manual outcome recording (promised payment, dispute, paid, no response) and a full activity timeline ([README.md](../README.md)).

- No inbound email ingestion yet — replies must be recorded manually ([PROGRESS.md](../PROGRESS.md) known limitations). Worth setting this expectation with a pilot user up front so they don't expect automatic reply detection.

## Adding a teammate (secondary path)

- **Friction (Medium):** initial password is set in plaintext by the inviter with no forced reset — see audit. Relevant as soon as a pilot involves more than one person at the customer.

## Overall read

The core golden path (import → triage → draft → approve & send → track) is coherent and the safety net (approval-gated sending, guardrailed drafts, org isolation) is genuinely strong. The two things most likely to undermine a first real pilot are the Critical offline-mode-ignores-notes issue and the lack of any onboarding explanation before a user hits the CSV import step. Both are addressable before inviting a real pilot customer, per [product_ux_audit.md](product_ux_audit.md).
