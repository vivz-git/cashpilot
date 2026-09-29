# Product UX Audit

Audit environment: local PostgreSQL, `AI_PROVIDER=mock`, `EMAIL_PROVIDER=mock`, fake/demo data only. No real emails sent, no real customer data used. Findings below are as reported by that prior audit session — this document organizes and preserves them; it does not claim to have re-run the audit.

Canonical automated test status (135 unit/integration + 6 E2E passing, typecheck/lint clean, `npm audit` 0 prod vulnerabilities) lives in [PROGRESS.md](../PROGRESS.md) — not repeated here beyond the summary in [test_results.md](test_results.md).

## Severity legend

- **Blocks first customer testing** — should be fixed before any real (even friendly-pilot) user touches the product.
- Severity (Critical/High/Medium/Low) reflects impact and likelihood as judged in the original audit, not re-scored here.

## Critical

| Finding | Observed evidence | Impact | Recommended fix | Blocks first customer testing? |
|---|---|---|---|---|
| Default offline AI mode ignores invoice notes | In `AI_PROVIDER=mock` (the default — see [README.md](../README.md) "offline mode"), analysis is rule-based and does not read free-text invoice notes, so a note like "client disputes the amount" or "promised payment 15th" doesn't change the analysis. | A user relying on default/offline mode could get a generic "chase this" recommendation on an invoice that's actually disputed or already has a promised date — directly undermining the "relationship-safe" positioning (see [gtm/positioning_hypotheses.md](../gtm/positioning_hypotheses.md)). | Either have the mock provider parse structured signals from notes (promise date, dispute keywords) with the same fact-override logic used for the Groq path ([DECISIONS.md](../DECISIONS.md) D33), or make it very clear in the UI when offline mode is active and why recommendations may be generic. | **Yes** — this is the default mode; any pilot customer not given a Groq key hits this on day one. |

## High

| Finding | Observed evidence | Impact | Recommended fix | Blocks first customer testing? |
|---|---|---|---|---|
| Dashboard priority table can contradict recorded status | An invoice's priority/analysis is only recomputed on manual re-analysis (bulk "Analyze outstanding," capped at 25 — [DECISIONS.md](../DECISIONS.md) D38); if status changes (e.g., marked paid, disputed) without re-analysis, the dashboard can still show a stale priority/recommendation. | A user could see conflicting information (invoice marked disputed, but priority table still says "chase now") and lose trust in the tool. | Recompute or visually flag stale analysis when status changes, rather than requiring the user to notice and manually re-run analysis. | Yes, for any pilot longer than a single sitting. |
| Priority table doesn't adapt to tablet/mobile | Columns are hidden behind horizontal scroll at narrower widths with no visible affordance indicating more columns exist. | A user on tablet/mobile could miss columns (e.g., days overdue, amount) without realizing there's more to scroll to. | Add a responsive layout (stacked cards below a breakpoint, or a visible scroll indicator) consistent with [PROGRESS.md](../PROGRESS.md)'s "no horizontal scroll at phone width" quality bar noted elsewhere. | Yes, if any pilot user is expected to use a tablet/phone. |
| CSV import is all-or-nothing | Per [DECISIONS.md](../DECISIONS.md) D23, any validation error blocks the whole import; the user must fix the file and re-upload rather than importing valid rows and flagging bad ones. | A single bad row in an otherwise large CSV forces a full re-upload cycle — real friction for a first-time import of a messy accounting export. | Consider allowing partial import with a clear per-row error report, if this doesn't conflict with the "avoid half-imported files" rationale in D23 — this is a genuine tradeoff, not a clear-cut fix. | Not strictly blocking, but likely to frustrate a first-time user during onboarding. |

## Medium

| Finding | Observed evidence | Impact | Recommended fix | Blocks first customer testing? |
|---|---|---|---|---|
| Login/signup gives little product explanation | The auth pages don't explain what CashPilot does before asking for credentials. | A first-time pilot user (or someone they forward the link to) may be confused about what they're signing up for. | Add a short explainer or link back to the README's "what it does" section on the signup page. | No, but recommended before wider pilot distribution. |
| Teammate-add flow uses plaintext initial password without forced reset | Per [DECISIONS.md](../DECISIONS.md) auth model, there's no forced password reset flow yet (also listed as a known limitation in [PROGRESS.md](../PROGRESS.md)); a new teammate's initial password is set in plaintext by the inviter. | A teammate's initial credential is known by whoever invited them, with no forced change — weaker than typical practice. | Add forced password change on first login, or move to invite-link + self-set-password flow. | No for a single-user pilot; yes before adding teammates in a real pilot. |
| Native browser validation styling is inconsistent | Form validation relies on native browser styling in places, which differs across browsers/devices. | Minor visual inconsistency, not a functional blocker. | Standardize on custom validation UI matching the rest of the design system. | No. |
| No visible progress/cap indication for bulk analysis | Bulk "Analyze outstanding" is capped at 25 invoices per click ([DECISIONS.md](../DECISIONS.md) D38) with no UI indication of the cap or progress while it runs. | A user with >25 open invoices may not realize not everything was analyzed, or may think the app is frozen during the synchronous call. | Show a progress indicator and an explicit "25 of N analyzed, click again for more" message. | Not blocking for small pilots (≤25 open invoices), worth fixing before larger ones. |

## Low

| Finding | Observed evidence | Impact | Recommended fix | Blocks first customer testing? |
|---|---|---|---|---|
| Mobile nav can wrap | Navigation items wrap awkwardly at some phone widths. | Cosmetic. | CSS fix to nav layout at narrow breakpoints. | No. |
| "Show message" semantics/accessibility could improve | Some UI messaging lacks clear accessible labeling/semantics. | Reduced usability for screen-reader users. | Audit and add appropriate ARIA roles/labels. | No, but should be fixed before any accessibility-sensitive customer. |

## Known MVP limitations (not audit findings, but relevant context)

Carried from [PROGRESS.md](../PROGRESS.md): in-memory rate limiter (single instance only), UTC-based "today"/overdue dates (no per-workspace timezone), a not-found invoice can render HTTP 200 due to streaming/loading behavior, no password reset/email verification/MFA/team-member removal, no inbound email ingestion (replies are manual), the evidence guard checks quote existence rather than truth, duplicate CSV rows are skipped rather than updated, and bulk analysis is capped at 25 invoices per click.
