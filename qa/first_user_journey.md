# CashPilot — First-Time User Journey

Written from the perspective of a new, skeptical agency owner who has never used CashPilot, walking through the app for the first time with no prior knowledge beyond "it's an AI accounts-receivable assistant." Every step was actually performed against a running instance (PostgreSQL 16, `AI_PROVIDER=mock`, `EMAIL_PROVIDER=mock`, fake data only). Screenshots referenced are in `qa/screenshots/`.

---

## 1. Signup

I go to the app's root URL. It redirects straight to `/login` — no landing page, no explanation of what I'm about to sign up for (`qa/screenshots/02-desktop-signup-empty.png` shows the equivalent signup screen). I click "Create a workspace."

The signup form asks for **Agency name, Your name, Work email, Password** (minimum 10 characters, shown as a hint under the field). It's clean and short — four fields, no unnecessary friction.

*"What am I supposed to do now?"* moment: none yet — the form is self-explanatory. But there's nothing on this screen telling me what CashPilot actually does. If I'd arrived here without already knowing (e.g., a teammate sent me a link, or I found it from an ad that didn't fully load), I'd have no idea.

I submit. Signup takes about a second (bcrypt hashing under the hood) and I land directly on `/dashboard`, already signed in — no separate "check your email to verify" step, no forced onboarding tour.

## 2. Workspace creation

This happens as part of signup, not as a separate step — one workspace per organization name I typed in. No option to join an existing workspace was offered or needed since this is genuinely my first account. Simple, correct default for a small agency.

## 3. First login

Not applicable separately — signup logged me in directly. On a second visit, `/login` asks for email and password only, with a "New to CashPilot? Create a workspace" link. Clean.

## 4. Understanding the dashboard

My first dashboard, with zero invoices, says exactly one thing: **"No invoices yet — Import a CSV of your open invoices to see what needs attention."** (`qa/screenshots/05-desktop-dashboard-empty.png`) That's a good empty state — it tells me the one thing I can do and why.

*"What am I supposed to do now?"* — Answered immediately and correctly: import a CSV.

## 5. Importing invoices

I click Import. The import page explains, in plain language, the required columns (`customer_name, customer_email, invoice_number, invoice_date, due_date, amount, currency`), the optional ones (`account_manager, notes`), the date format, and the row/size limits — and shows a live CSV example at the bottom of the page I could copy from. This is one of the best-designed screens in the product: everything I need to build a correct file is right there before I try anything.

## 6. Understanding errors

I deliberately uploaded a malformed file first (bad email, US-not-a-country-code as a currency, wrong date format, a missing name, a missing invoice number). The result: **"The file was not imported. Fix these 6 problems and upload it again,"** followed by a table — Line, Column, Problem — with a specific, readable sentence for each ("`"06/01/2026" is not a valid date. Use YYYY-MM-DD, e.g. 2026-03-31.`"). (`qa/screenshots/07-desktop-import-malformed-errors.png`)

This is genuinely good error UX — no jargon, no stack traces, exact row numbers. My one complaint, covered in the main audit as High issue #3: nothing is imported (by design), and I have to go fix the file myself outside the product, then re-upload the whole thing. With a small test file that's a 30-second round trip; with a real 200-row export it would be slower and more annoying, especially because I can't see the bad rows highlighted in place — I have to find "line 37" myself in a spreadsheet.

I also separately tested a file with just one row missing a customer email — same clear, isolated error. And a file with a duplicate invoice number *within the same file* — also caught cleanly, before anything touched the database.

*"What am I supposed to do now?"* — Never confused here. The error table always told me exactly what to fix.

## 7. Seeing AI analysis

I fixed my file and re-uploaded — 7 invoices imported cleanly, confirmed with **"Imported 7 invoices. Go to dashboard."** The dashboard now shows real numbers: outstanding and overdue totals broken out *per currency* (USD, EUR, GBP, JPY in my test set), a "Needs attention today" count, and a banner: **"1 not analyzed — Unanalyzed invoices appear after analyzed ones in the priority order."**

I click **"Analyze 8 new invoices."** A couple of seconds later, every invoice now has a priority score out of 10, a situation tag, and a recommended action.

*Here is where the "aha" moment should be — and it partially isn't.* Every single invoice, regardless of its notes, came back with situation **"Unknown"** and the exact same recommended action: *"Send a friendly first reminder and ask the customer to confirm they received the invoice."* This includes an invoice whose notes literally say "Customer disputes this charge" and one that says "will pay by the 30th." As a new user testing this with real notes from my own business, my honest first reaction would be: *"Did it even read the notes field?"* (It didn't — see the main audit's Critical issue #1 for why, and the important caveat that this is the offline/no-API-key mode, honestly labelled as such once you open an invoice.)

## 8. Understanding why an invoice is prioritized

Opening an individual invoice is much more reassuring than the dashboard table. Each invoice has an "AI analysis" card with:
- Priority badge (e.g., "9/10"), situation ("Unknown"), a **"low confidence"** badge, and a tone indicator.
- **Reason:** a one-line, factual sentence ("$48,500.00 is 197 days overdue; no reminders sent yet.")
- **Recommended action.**
- **Missing information:** an honest bullet list of what the AI doesn't know ("No contact with the customer yet, so the reason for non-payment is unknown.")
- A small, expandable **"Source: rule-based (offline mode) · [timestamp]"** line.

*"What am I supposed to do now?"* — Not confused here either, and genuinely pleasantly surprised: the "Missing information" section tells me what the AI *doesn't* know instead of pretending to know it. This is the single best trust-building detail in the whole product.

## 9. Reviewing a follow-up draft

I click "Draft follow-up." A couple of seconds later, a complete plain-text email appears: recipient shown at the top ("To billing@bluewave.test"), subject pre-filled ("Invoice INV-9002 – payment reminder"), body signed off with my own name and workspace. A line right under the editor states plainly: **"Nothing is sent until you click Approve & Send. The email goes to billing@bluewave.test as plain text and replies come to your address."** That sentence alone answers three of the trust questions this audit asked me to check, in one place, without me having to dig for the answer.

## 10. Editing the draft

I edited the body to add deliberately aggressive language ("we will pursue legal action and report this to a collections agency... immediately"). Live, without saving or reloading, a warning box appeared: **"Review before sending: Draft mentions legal action. Draft mentions debt collection. Draft applies pressure ('immediately', 'urgent')."** It didn't block me from sending — it just made sure I couldn't miss what I was about to send. That's exactly the right balance for a human-approval workflow: nudge, don't nag, never override the human's own judgement. (`qa/screenshots/22-desktop-bluewave-draft-edited-aggressive.png`)

I then edited it back to something reasonable before continuing.

## 11. Approving the email

I clicked "Approve & Send." Within about a second, the page updated: **"Emails sent (1)"**, with status "sent," the exact recipient, my name as sender, a timestamp, and "1 attempt." The "Draft follow-up" section reset to "No draft" — meaning the only way to send *again* is to deliberately generate a new draft and approve it again. There is no button sitting there inviting an accidental second click.

*"What am I supposed to do now?"* — Not confused. The state change was immediate, visible, and left no ambiguity about whether the email actually went out.

## 12. Recording the outcome

On a different invoice with a "will pay by the 30th" note, I used the **Record outcome** panel: selected "Promised payment," a date field appeared, I filled it plus a free-text note, clicked Record. Instantly: the invoice header gained a status, "Promise to pay" in the details sidebar populated, and — most importantly — it disappeared from "Needs attention today" and appeared in a new "Promised to pay" section on the dashboard.

I repeated this with "Dispute" on another invoice — it gained a "Disputed" badge and moved into a "Disputed" dashboard section with the reason visible.

## 13. Understanding the timeline

Every invoice detail page has a **Timeline** at the bottom, newest first, in plain sentences: "Invoice imported," "AI analyzed: priority 9/10...", "Reminder drafted", "Reminder sent to billing@bluewave.test: ...", each with a timestamp and who did it. This reads like an audit log a bookkeeper would actually trust, not a raw event dump.

## 14. Returning to the dashboard

Back on the dashboard, the numbers had updated correctly: "Needs attention today" dropped from 8 to 5 (removing the sent-to, disputed, and promised invoices), a "Promised to pay (1)" card and a "Disputed (1)" card appeared with the right amounts. **The one thing that didn't update:** the big "All outstanding invoices by priority" table further down the page still showed the disputed invoice's Situation as "Unknown" and its Recommended Action as the generic first-reminder text — contradicting the "Disputed" card two sections above it on the same screen. If I were quickly scanning this table rather than reading every card, I could plausibly send a "friendly reminder" to a customer whose invoice I'd just marked disputed. (Covered as High issue #1 in the main audit.)

---

## Summary of every "what am I supposed to do now?" moment

| # | Moment | Confusing? | Notes |
|---|--------|-----------|-------|
| 1 | Arriving at the bare login/signup screen | Mildly | No product explanation at all, but the form itself is self-explanatory |
| 2 | Empty dashboard | No | Clear one-line instruction and a button |
| 3 | Import page before uploading | No | Format instructions and example are right there |
| 4 | CSV validation errors | No | Best error UX in the product |
| 5 | AI analysis results (dashboard table) | **Yes** | Every invoice says the same generic thing regardless of notes; not obviously "this is offline mode" from the table alone |
| 6 | AI analysis results (invoice detail page) | No | "Missing information" and "Source: rule-based (offline mode)" resolve the confusion from #5 — but only once you click in |
| 7 | Draft review/edit/send | No | Recipient, approval requirement, and live safety warnings are all explicit |
| 8 | Recording an outcome | No | Immediate, visible feedback |
| 9 | Timeline | No | Reads clearly |
| 10 | Dashboard after recording an outcome | **Yes** | Table contradicts the card above it for the same invoice |

**Net:** 2 of 10 journey moments produced genuine "wait, what?" hesitation, both tracing back to the same root cause — the AI recommendation not reflecting what the product already knows (either because it's running offline, or because it hasn't been told to re-check itself after new activity). Every other step of the core workflow was clear, well-labelled, and did what it said it would do.
