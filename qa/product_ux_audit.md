# CashPilot — Product / UX / Trust Audit

**Auditor role:** skeptical first-time agency owner, plus product/UX/QA reviewer
**Date:** 28 September 2026
**Branch under test:** `claude/peaceful-dijkstra-vgphzy` (the only branch with a working app; `main` is an empty scaffold — see `test_results.md` for details)
**Method:** ran the real application against a local PostgreSQL 16 database, `AI_PROVIDER=mock`, `EMAIL_PROVIDER=mock` (no real email or paid AI calls made), driven with Playwright + Chromium, plus direct reading of `DECISIONS.md` and `SECURITY_REVIEW.md` written by the build team to check claims against observed behaviour.

---

## Update — 2026-09-29 verification pass

A later manual verification pass produced new evidence (detail, environment and limitations in [test_results.md](test_results.md)). The original 2026-09-28 text below is kept as written; findings affected by the later pass carry an "Update 2026-09-29" note. Summary of what changed:

| Finding | 2026-09-28 | 2026-09-29 |
|---|---|---|
| C1 — offline AI ignores notes | Critical | **Narrowed and re-scored to High.** Only notes supplied through CSV import are ignored in offline mode; promise and dispute recorded through the product forms are honoured. |
| H1 — stale dashboard table | High | Not re-tested; unchanged. |
| H2 — tablet/phone table clipping | High | **Confirmed** at 390px and 768px; unchanged. |
| H3 — all-or-nothing import | High | Not re-tested; unchanged. |
| H4 — accounting-export layouts rejected | — | **New**, High (provisional). |
| M1–M4, L1–L5 | — | Not re-tested; unchanged. |

Counts: 0 Critical, 5 High, 4 Medium, 5 Low (was 1 / 3 / 4 / 5).

Still untested: real Groq AI with a real API key; real SMTP delivery to a real mailbox; load beyond approximately 60 invoices; browsers other than Chromium; real customer files and real customer users. Concurrent duplicate-send protection was not independently reproduced by this QA process; only UI double-click behaviour was observed.

---

## Executive summary

CashPilot's MVP is **further along, better engineered, and more disciplined about safety than a typical first MVP.** The core loop — import → dashboard → AI analysis → draft → edit → approve & send → outcome → timeline — works end to end, every screen I touched rendered cleanly, and the product is honest in places where most MVPs would bluff (it labels its own analysis "low confidence" and "rule-based (offline mode)" rather than presenting a guess as fact).

**Strongest parts:**
1. **The approval and safety net around sending email is genuinely good.** Recipient is always the invoice's stored email, nothing sends without an explicit "Approve & Send" click, the button disappears the instant a send is confirmed (no double-send path through the UI), and editing a draft triggers *live* warnings ("Draft mentions legal action / debt collection / applies pressure") without blocking the human's judgement.
2. **Role-based access is enforced in the UI, not just the API.** A viewer sees the same data but every button that mutates anything (draft, send, record outcome, import, add teammate) is replaced with plain-text explanations ("Your role is read-only") instead of being disabled-but-visible or hidden with no explanation.
3. **Organization isolation held up.** A second, unrelated workspace could not open the first workspace's invoice by guessing its URL — it got a proper "Not found" page, not a 403 that would confirm the ID exists.

**Biggest risks:**
1. **The default, zero-config AI experience is not what the product promises.** With no `GROQ_API_KEY` (the out-of-the-box state, including the seeded demo account described in the README), every invoice — regardless of amount, days overdue, or notes text — gets situation "Unknown" and the identical recommended action, "Send a friendly first reminder…". Notes that say "customer disputes this charge" or "will pay by the 30th" are completely ignored by the analysis. This is defensible as an offline fallback, and it is honestly labelled, but it means the first impression of the product's core differentiator (an AI that understands *why* a customer hasn't paid) is a templated non-answer. See Critical Issue #1. *(Update 2026-09-29: this was observed with notes supplied via CSV import. Promise and dispute information recorded through the product forms is honoured by the offline analysis, so the risk is narrower than stated here, and C1 is re-scored High.)*
2. **The AI recommendation on the dashboard goes stale silently in the main table.** After I recorded a dispute on an invoice, the dashboard's "All outstanding invoices" table still showed "Unknown / Send a friendly first reminder" for that same invoice in the grid, while a separate card correctly said "Disputed." A user who only glances at the table could still see a nudge toward a generic reminder for a customer who is actively disputing the charge — the opposite of "relationship-safe." See High Issue #1.
3. **Dashboard tables do not adapt to mobile or tablet.** The priority tables overflow their container; on a 390px-wide phone only Priority/Invoice/Customer are visible, and Amount, Overdue, Situation, and Recommended Action — the numbers an owner is checking on their phone — are scrolled off-screen with no visible cue that more columns exist. See High Issue #2.

None of this is a "stop everything" situation — nothing I found let money move without a human, exposed one org's data to another, or let a malicious note change what gets sent. But issues 1 and 2 go to the heart of what a prospect would judge in the first five minutes, and issue 3 to what they'd judge the first time they check the app away from a desk.

### Is it understandable within 30 seconds?
**Partially.** Once inside, the dashboard is genuinely legible — five stat tiles, a "needs attention today" list, clear per-currency totals with an explicit "Per currency, not converted" label so nothing pretends to convert money it can't. But the very first thing any new user sees — `/login` or `/signup` — is a bare form with no tagline, no one-line description of what CashPilot does, and no visual distinction from any other SaaS login screen. A skeptical owner arriving cold would need to already know what they signed up for.

### Is the primary action obvious?
**Yes**, once past the door. "Analyze N new invoices" and "Import CSV" are the two buttons on an empty/partial dashboard, and each invoice detail page has one obvious primary button at a time ("Draft follow-up" → "Approve & Send"). Good.

### Is it trustworthy?
**Mostly, and for the right reasons.** The product volunteers its own uncertainty ("low confidence", "Source: rule-based (offline mode)") rather than hiding it — the opposite of most AI-feature MVPs, and the single best trust signal I found. See Critical #1 and High #1 for the two places that trust story has cracks.

### Is it safe enough for financial workflow?
**Yes, at the guardrail level I could test.** Cross-org isolation held, plain-text-only email with recipient locked to the invoice record, no HTML/script execution of customer-supplied notes (a literal prompt-injection payload rendered as inert text and had zero effect on the analysis or the draft), duplicate-send blocked by the UI (draft clears after a successful send). I could not exercise the claimed database-level concurrency race test myself (see `test_results.md` limitations) — I'm relying on the team's own `SECURITY_REVIEW.md` for that specific claim.

### Is it credible enough to become a paid SaaS product?
**The bones are there; the demo isn't yet.** The workflow logic, guardrails, and visual polish are ahead of most MVPs. What would lose a skeptical prospect in a first demo is exactly the mock-AI genericness (Critical #1) and the stale-recommendation contradiction (High #1) — both fixable without new features.

---

## Critical issues

Anything that could prevent safe use if unaddressed before real customer testing.

> **Update 2026-09-29:** no finding remains Critical after re-scoring. C1 is kept here under its original ID for continuity and is now rated High (see its Severity line).

### C1. The default AI experience (no API key) ignores the one thing agencies actually write in their notes

> **Update 2026-09-29 — narrowed and re-scored (Critical → High).** The offline/mock provider ignores notes supplied through **CSV import**. Promise and dispute information recorded through the product forms **is** honoured (situation "Promised payment" with high confidence, or "Needs human judgement"; follow-up dates adjust; the draft is dispute-aware). The description below was written on 2026-09-28 and applies to imported notes in offline mode, not to all recorded context. Limitation: offline mode only; a real AI provider was not tested. Interpretation: Critical is not supported by the current evidence, because nothing sends without a human click, the structured path works, and the offline caption is shown; the remaining issue is credibility and first impression for users who import context as notes. This re-score is a reviewer judgement and can be overridden.

- **Where it occurs:** Every invoice analysis when `AI_PROVIDER=mock`/unset and no `GROQ_API_KEY` — which is the shipped default in `.env.example`, and therefore also the state of the `npm run db:seed` demo account (`demo@cashpilot.local`) that the README tells a new evaluator to sign in with.
- **Why it matters:** The product's entire value proposition, per its own description, is "shows which overdue invoices need attention, **suggests why a customer may not have paid**." I imported invoices with notes reading "Customer disputes this charge – says scope was reduced mid-project" and "Client emailed: will pay by the 30th once their invoice from us clears." Both came back with situation **Unknown**, 7/10 and 5/10 priority computed only from amount/days-overdue, and the *identical* recommended action as a customer with zero notes: "Send a friendly first reminder and ask the customer to confirm they received the invoice." A prospect trying the product with realistic notes, on the default configuration, will conclude the AI doesn't read anything — because in this mode it doesn't.
- **Evidence:** `qa/screenshots/16-desktop-invoice-delta-dispute-note.png` / `18-desktop-invoice-cedar-promise-note.png` (source code: `src/server/ai/providers/mock.ts` calls the exact same `ruleBasedAnalysis` used as the fallback; it never looks at the `notes` field). Confirmed in `DECISIONS.md` D30/D33 — this is intentional, not a bug.
- **Suggested fix:** Not a code change to the guardrails (those are correct and should stay). Two lower-risk options: (a) make the mock provider do a *light*, clearly-labelled heuristic pass over notes (e.g., detect words like "dispute"/"promise"/"will pay" and surface them as a suggestion the user must still confirm, still tagged "offline mode, not verified"), so the demo shows the *shape* of the value without inventing facts; or (b) if a real key is unavailable for a trial, put a visible banner on the dashboard/analysis card — not just a small "Source: rule-based (offline mode)" caption — saying "Connect an AI provider to get situation-aware analysis; this is a offline placeholder based on days overdue and amount only." Either removes the risk that a prospect judges the finished product by its de-fanged demo mode.
- **Severity:** ~~Critical~~ **High** (re-scored 2026-09-29; originally Critical — credibility of core value prop)
- **Fix before first customer testing:** Originally "Yes". Update 2026-09-29: conditional — yes if the pilot runs offline and relies on imported notes; otherwise no. At minimum, ship the more prominent "offline mode" notice (b), and/or steer users to the promise and dispute forms; it's a small change with an outsized trust payoff.

---

## High-priority issues

### H1. Stale AI recommendation on the dashboard contradicts the invoice's actual (structured) status

- **Where it occurs:** `Dashboard → All outstanding invoices by priority` table, after an outcome (dispute, promised payment) has been recorded but before the user manually clicks "Re-analyze".
- **Why it matters:** I recorded a dispute on Delta Robotics GmbH. The invoice detail page correctly showed a "Disputed" badge and the dashboard's own "Disputed (1)" summary card correctly listed it with the reason. But the same dashboard's main priority *table*, two sections down, still showed that invoice as Situation "Unknown" with Recommended Action "Send a friendly first reminder…" — a direct, visible contradiction on one screen. The invoice detail page does show a small "New activity since this analysis. Re-analyze for an up-to-date recommendation." nudge, but that nudge does not appear on the dashboard table itself, where a busy owner is most likely to be scanning and acting quickly.
- **Evidence:** `qa/screenshots/31-desktop-dashboard-after-outcomes.png` — compare the "Disputed (1)" card against the "All outstanding invoices by priority" row for INV-9004 two sections below it.
- **Suggested fix:** Either (a) grey out / relabel the Situation and Recommended Action cells for any invoice with activity newer than its last analysis (e.g., "Stale — re-analyze"), matching the language already used on the invoice detail page, or (b) auto-trigger a background re-analysis after a manual outcome is recorded, so the table can't say something that contradicts the invoice's own structured status.
- **Severity:** High (trust/relationship-safety — a disputed customer could get a generic dunning email if the user only skims the table)
- **Fix before first customer testing:** Yes.

### H2. Priority tables do not adapt to mobile or tablet widths

- **Where it occurs:** `Dashboard` (both "Needs attention today" and "All outstanding invoices by priority" tables), at 390px (phone) and 834px (tablet) viewports.
- **Why it matters:** The invoice **detail** page is genuinely well responsive — it reflows into clean stacked cards on mobile (`qa/screenshots/45-mobile-invoice-detail.png`). The dashboard tables do not: on a phone, only Priority / Invoice / Customer are visible before the row is cut off; Amount, Overdue, Situation, Recommended Action, and Follow-ups require horizontal scrolling with no visible affordance (no scroll shadow, no "→ more" hint) that more columns exist. On tablet the same table is cut off one column earlier than desktop. This is the screen an owner is most likely to check from their phone between meetings — and it's the one page where the numbers that matter (amount owed, why it's urgent) are hidden by default.
- **Evidence:** `qa/screenshots/44-mobile-dashboard.png`, `qa/screenshots/44-tablet-dashboard.png`.
- **Update 2026-09-29 — confirmed.** Re-checked in Chromium at 390px and 768px: the dashboard tables clip their right-hand columns behind an inner horizontal scroll with no obvious visible cue. The same pass found no page-level horizontal overflow, which is consistent: the overflow is inside the table's own scroll region, which a page-level check does not detect. Limitation: Chromium only; the columns clipped at 768px were not listed.
- **Suggested fix:** On narrow viewports, either switch the dashboard tables to the same stacked-card pattern already used successfully on the invoice detail page, or make the horizontal scroll region visually obvious (sticky first column + fade/shadow at the cut edge) and put Amount before Customer in scroll order since it's the more decision-relevant field.
- **Severity:** High (this is the primary interface for the primary device many owners will actually check it on)
- **Fix before first customer testing:** Recommended, especially if any early customer will be shown the product on a phone/tablet during a sales conversation.

### H3. CSV import is strict all-or-nothing, with no way to see or fix problem rows in place

- **Where it occurs:** `/import`, any row-level validation error.
- **Why it matters:** This is a deliberate, defensible design choice (`DECISIONS.md` D23: "avoids half-imported files") and the error table itself is genuinely excellent — line, column, and a plain-English message for every problem, all at once, not one-at-a-time. But the recovery path is entirely outside the product: the user has to open the CSV in Excel/Numbers/a text editor, find the exact row and column named, fix it, save, and re-upload the *entire* file — even if only one of 200 rows has a typo'd currency code. Real accounting exports (QuickBooks, Xero) routinely have a handful of rows with a missing email or a locale-formatted date. For a first import with, say, 50 real invoices, hitting 3–4 rows with problems means 3–4 fix-and-reupload round trips with zero in-product help.
- **Evidence:** `qa/screenshots/07-desktop-import-malformed-errors.png`, `qa/screenshots/12-desktop-import-missing-email-only.png`.
- **Suggested fix:** Not "silently import the valid rows" (that would undermine the safety rationale). Instead: let the user download a copy of the file with only the bad rows extracted (or highlighted) after a failed import, so the fix-and-reupload loop doesn't require them to re-locate every flagged row by hand in a 500-row spreadsheet.
- **Severity:** High (first-import friction directly affects whether a trial user reaches the "aha" moment at all)
- **Fix before first customer testing:** Worth doing before onboarding a real agency with a non-trivial invoice list; the current behaviour is acceptable for a guided pilot where you import the file together.

### H4. Accounting-software export layouts are rejected, with no column mapping *(new 2026-09-29; severity provisional)*

- **Where it occurs:** `/import`, when a file does not use the importer's exact column names and date format.
- **Observed:** A QuickBooks-style and a Xero-style CSV were both rejected. The error explains which columns are expected but offers no way to map the file's columns onto them. Read from the fixtures and the importer: the QuickBooks-style file has header `Date,Transaction type,Num,Customer,Due date,Open balance`, DD/MM/YYYY dates, amounts like `"$4,250.00"`, and no email or currency column; the Xero-style file has header `ContactName,EmailAddress,InvoiceNumber,InvoiceDate,DueDate,Total,InvoiceAmountDue,Currency` and dates like `15 Jul 2026`. The importer requires exact snake_case column names and ISO `YYYY-MM-DD` dates.
- **Limitation:** Both files are hand-written representative fixtures, not downloaded vendor exports. Real exports vary by report and settings. This is **not** proof that every actual QuickBooks or Xero export will fail, and it is not proof that they would pass.
- **Interpretation:** A real onboarding usability issue. The import page documents the required format well (see the first-user journey), but a first-time user with an accounting export has to reshape it by hand, and the error tells them what is expected without helping them get there. The QuickBooks-style layout has no email column at all, so column mapping alone would not be enough. Related to H3. Severity is provisional because the likelihood with real exports is unverified.
- **Suggested fix (not applied):** Test with two or three real exports from pilot candidates first. Then consider a column-mapping step or header aliases for common accounting names; common date and amount formats with explicit user confirmation of ambiguous DD/MM vs MM/DD dates rather than guessing; a downloadable template CSV and short export guidance.
- **Severity:** High (provisional)
- **Fix before first customer testing:** Likely for a self-serve pilot; low for a guided pilot where the file is reshaped together. Re-assess after testing real exports.

---

## Medium-priority issues

### M1. No product explanation anywhere inside the app itself

- **Where it occurs:** `/login`, `/signup` — the actual first screens a new user sees when they go to the app URL.
- **Why it matters:** Both screens show only "CashPilot" as a wordmark, the form, and a link to the other auth screen. No tagline, no "what this does," no logo beyond the initial letter. (There is a separate marketing landing page in this repository's `claude/cashpilot-landing-page-ws0idg` branch, but that is a different Next.js app entirely — it is not what renders at the product's own root/login route, and a user who reaches the app directly, e.g. via a bookmark or after clicking through the marketing site's own CTA, still lands on this bare screen.)
- **Evidence:** `qa/screenshots/02-desktop-signup-empty.png`.
- **Suggested fix:** One sentence under the wordmark ("Follow up on overdue invoices without the awkward emails" or similar) costs nothing and immediately orients someone who arrives without context (a teammate an owner just invited, for instance).
- **Severity:** Medium
- **Fix before first customer testing:** Nice to have; low effort, non-zero payoff for anyone other than the owner who set the account up.

### M2. "Initial password" onboarding for teammates has no forced reset and no email delivery

- **Where it occurs:** `/team → Add teammate`.
- **Why it matters:** Adding a teammate requires the owner to type a plaintext initial password into a form field themselves (confirmed: `Add teammate` fails client-side with "Please fill out this field" if left blank — there's no server-generated password or emailed invite link). The UI does say "Share the initial password with them securely" after adding, which is honest, but the product gives the owner no help doing that securely, and — as far as I could exercise in this session — there's no forced password change on first login. For a financial tool, an owner permanently knowing every teammate's original password (if they don't proactively rotate it) is a weak point worth tightening before it's someone else's real business.
- **Evidence:** `qa/screenshots/34-desktop-team-page.png` (form fields), confirmed against `SECURITY_REVIEW.md`'s own "Known limitations" list ("No email verification, password reset, MFA, or session listing/revocation UI").
- **Suggested fix:** At minimum, force a password change on the teammate's first login. Email-based invites are a bigger feature and reasonably out of scope for MVP.
- **Severity:** Medium
- **Fix before first customer testing:** Not blocking for a single-owner pilot; becomes relevant the moment a second teammate is added.

### M3. Native browser validation instead of the app's own styling

- **Where it occurs:** Signup form, Team "Add teammate" form (confirmed); likely other forms using the same pattern.
- **Why it matters:** Submitting an incomplete form pops the browser's own default tooltip ("Please fill out this field") rather than the custom, consistently-styled inline messages the app uses everywhere else (e.g., the CSV import error table). It's functional and not a blocker, but it's the one place the polish drops, and native tooltips render and behave inconsistently across browsers and are not reliably announced to screen readers the way an inline, associated error message would be.
- **Evidence:** `qa/screenshots/03-desktop-signup-empty-submit.png`, `qa/screenshots/36-desktop-team-after-invite.png` (visible in the earlier full run's screenshot).
- **Suggested fix:** Client-side field validation styled to match the rest of the app, with `aria-describedby` pointing at the message.
- **Severity:** Medium (accessibility + consistency)
- **Fix before first customer testing:** No.

### M4. "Analyze" is a manual, synchronous batch action with no visible progress state

- **Where it occurs:** Dashboard "Analyze N new invoices" button.
- **Why it matters:** Per `DECISIONS.md` D38, this runs synchronously in a server action, capped at 25 invoices per click. In my test with 8 invoices it returned in a couple of seconds with no perceptible loading state I could screenshot (the button click and page update happened faster than I could capture an intermediate state) — fine at this scale, but there is no loading indicator built for the case where it takes longer (25 invoices against a real, possibly slow, LLM API), and no messaging about the 25-invoice cap anywhere in the UI. A user with 60 overdue invoices clicking "Analyze 60 new invoices" (if that's what the button would say) and getting only 25 analyzed with no explanation would be confused.
- **Evidence:** Behavioural, from `DECISIONS.md` D38; not independently reproduced at scale (see limitations in `test_results.md`).
- **Suggested fix:** A visible loading state on the button/page during analysis, and if the batch is capped, say so ("Analyzing the first 25 of 60 — click Analyze again for the rest").
- **Severity:** Medium
- **Fix before first customer testing:** Only relevant once a pilot customer has a large invoice backlog.

---

## Low-priority polish

- **L1 — Mobile nav wraps awkwardly.** "Dashboard / Import / Team / Sign out" wraps to a second line on a 390px viewport rather than collapsing into a menu. Functional, not elegant. (`qa/screenshots/46-mobile-import.png`)
- **L2 — The CSV format example at the bottom of the Import page overflows its container slightly on mobile** (a raw CSV line runs off the right edge with no wrap or horizontal scroll indicator). Cosmetic only — it's reference text, not an interactive element.
- **L3 — "Show message" (viewing a previously sent email's exact content) uses a disclosure element rather than an explicitly labelled button** — I could not reliably drive it via role-based selectors in automated testing, which suggests it may also be a slightly weaker target for assistive tech than a proper `<button>`. Worth a quick semantic check.
- **L4 — Priority badge colour coding (red/amber/grey) is not accompanied by a text-only equivalent beyond the number itself.** The number (e.g., "9/10") is present as text so this isn't a pure colour-only signal, but the colour-to-urgency mapping itself is never explained anywhere in the UI (no legend, no tooltip).
- **L5 — No visible way to change your own password from the app** — noted for completeness, not tested for existence via a "Settings" page I could not find in the primary nav; likely out of MVP scope but worth confirming it isn't simply missing from navigation.

---

## What's already strong (don't lose these in a redesign)

1. **The "nothing sends until you click Approve & Send" story is told consistently, in the right places, in plain language** — on the draft screen itself, in the timeline, and by the fact that duplicate/unsafe sends are structurally hard to trigger through the UI, not just policy.
2. **The live draft safety check** (threatening language / legal threats / collections language flagged in real time as you type, without blocking the send) is exactly the kind of guardrail that makes "relationship-safe" a credible claim rather than a marketing line.
3. **Error messaging on CSV import** is best-in-class for an MVP: specific line, specific column, plain-English explanation, no jargon, and a live example format shown right below it.
4. **Role-based UI, not just role-based API.** Viewers get clear, worded explanations instead of disabled ghost-buttons; this is a small thing most MVPs skip and it matters a lot for trust with a team that isn't the account owner.
5. **Multi-currency handling is honest.** Totals are shown per currency with an explicit "Per currency, not converted" label rather than a bogus blended total — the right call for a finance tool.
