# Test Results

Canonical, up-to-date test counts live in [PROGRESS.md](../PROGRESS.md) — this document does not restate or re-derive those numbers. It summarizes the separate QA/UX audit pass and its environment, and points to the audit's own findings rather than duplicating them.

## Canonical automated test status

See [PROGRESS.md](../PROGRESS.md) "Latest results" and "Test coverage against the spec" tables: unit/integration and E2E suite counts, typecheck/lint status, and `npm audit` results are tracked there. If this document and `PROGRESS.md` ever disagree on a number, `PROGRESS.md` is authoritative — treat a discrepancy as a documentation bug to fix, not a fact to reconcile here.

## QA/UX audit pass (this document's scope)

Environment: local PostgreSQL, `AI_PROVIDER=mock`, `EMAIL_PROVIDER=mock`, fake/demo data only, no real emails, no real customer data.

This was a manual, end-to-end exploratory pass through the application (import → dashboard → analysis → draft → approve & send → outcome tracking), distinct from the automated Vitest/Playwright suites referenced in `PROGRESS.md`. It also included one live check against the real Groq API using fake data, specifically probing a prompt-injection attempt in invoice notes — the injected instruction was ignored and the resulting draft passed the safety checks ([DECISIONS.md](../DECISIONS.md) D34, D31/D32).

Findings from this pass are recorded in full in [product_ux_audit.md](product_ux_audit.md), organized by severity and whether each blocks first-customer testing. Summary counts: 1 Critical, 3 High, 4 Medium, 2 Low.

## Strong areas confirmed during the audit

- Approve-before-send safety net — nothing sends without an explicit human click.
- Live draft warnings surfaced to the user during editing.
- Recipient locked to the invoice record (never AI- or form-controlled).
- Duplicate-send prevention held up under concurrent Approve & Send attempts.
- Role-based UI enforcement (viewer/member/owner) behaved as expected.
- AI uncertainty is labelled honestly rather than hidden (low-confidence/`unknown` results flagged for human review).

## What this pass does not cover

- No load/performance testing.
- No test with a real pilot customer or real data.
- No independent re-run of the automated Vitest/Playwright suites — their results are taken from `PROGRESS.md` as of the date that document was last updated.

## Recommended gating before first real pilot user

Per [product_ux_audit.md](product_ux_audit.md), the Critical finding (offline mode ignoring invoice notes) and, ideally, the High findings should be addressed or explicitly flagged to the pilot user before onboarding — see [qa/first_user_journey.md](first_user_journey.md) for where in the flow these surface.
