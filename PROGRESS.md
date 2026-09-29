# Progress

_Last updated: 2026-09-29_

## Status: ready for a controlled pilot (not production-verified)

The branch `claude/peaceful-dijkstra-vgphzy` is on GitHub as draft PR #1. The 2026-09-29 pilot-readiness
fixes below are committed locally on that branch and have not been pushed.

## Completed

| Phase | Work | Verified by |
|-------|------|-------------|
| 1 Plan | Repository inspected (it was empty), stack chosen, plan, decision log | — |
| 2 Foundation | Next.js 16 + TypeScript + Tailwind; PostgreSQL schema and migrations (Drizzle); email/password auth, DB sessions, organizations, roles (owner/member/viewer); org-scoped service layer; rate limiting; audit log | `tests/integration/auth.test.ts`, `isolation.test.ts` |
| 3 Core | CSV import with row-level errors → invoice storage → AI analysis (Groq or offline mock) with guardrails → dashboard and priority queue → follow-up drafting with safety checks → edit → Approve & Send over SMTP → manual outcomes → activity timeline | Unit, integration and E2E suites |
| 4 Tests | 135 Vitest tests (unit + integration against real PostgreSQL), in-process SMTP server tests | `npm test` |
| 5 E2E | 6 Playwright tests on a production build (desktop + phone) | `npm run test:e2e` |
| 6 Security | Review with fixes (see [SECURITY_REVIEW.md](SECURITY_REVIEW.md)); CSRF, cookie flags and bundle secrets checked against a running server | Tests + manual probes |
| 7 Quality | Typecheck and lint clean; empty, loading and error states; no horizontal scroll at phone width; broken `db:seed` script fixed | Checks + screenshots |

### Latest results (2026-09-29, local PostgreSQL 16, Chromium only)

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm test`: **175 passed**, 0 failed (11 files)
- `npm run test:e2e`: **7 passed**, 0 failed (production build, desktop + phone), in two consecutive full runs
- `npm audit --omit=dev`: 0 vulnerabilities
- Live Groq check (2026-09-27, fake data, by the build): valid structured output, injected instruction ignored, drafts passed safety checks. **Not repeated since**; re-check with the pilot's own key before use.
- Real SMTP delivery to a real mailbox: **never verified**. Only the mock provider and a local in-process SMTP server have been used.

## Pilot-readiness gate (2026-09-29)

Findings from the QA passes (PR #3) were checked against the code. Fixed as pilot blockers:

| Blocker | Why it blocked a pilot | Fix | Verified by |
|---|---|---|---|
| Accounting-style exports rejected (QA H4) | A first customer's export uses its own column names and date formats; the only path was reshaping the file by hand | Column-matching step with suggestions, chosen date order, currency symbols, default currency (D29) | `tests/unit/csv.test.ts`, `tests/integration/import.test.ts`, E2E "export with different column names" |
| Dashboard table kept advising a reminder after a dispute (QA H1) | Main screen contradicted the recorded dispute — the opposite of relationship-safe | Recorded dispute and newer activity override stored recommendation in tables (D39) | `tests/integration/outcomes.test.ts`, E2E full journey |
| Mock email looked like real delivery | With the default `EMAIL_PROVIDER`, sends showed as "sent" with nothing delivered | Test-mode / misconfiguration banner, "not delivered" label, pilot checklist in README (D48a) | `tests/unit/runtime-mode.test.ts`, E2E full journey |

Assessed and **not** treated as blockers:

- Dashboard tables on phone/tablet hide right-hand columns behind an inner scroll (QA H2). All data is reachable, the invoice page reflows well, and the pilot is desktop-first. Scheduled for the frontend redesign.
- Offline AI ignores notes imported from CSV. The pilot should run with Groq; offline mode is now labelled on every page.
- All-or-nothing import (QA H3), teammate onboarding (M2), native form validation (M3), analysis progress (M4).

### Test coverage against the spec

| Spec item | Where |
|-----------|-------|
| Malformed CSV, duplicate invoice, missing email, invalid amount, invalid date, multiple currencies | `tests/unit/csv.test.ts`, `tests/integration/import.test.ts`, E2E |
| AI: missing context, conflicting context, malicious text, ambiguous situation, prompt injection, hallucination prevention | `tests/unit/ai-guard.test.ts`, `tests/unit/drafting.test.ts`, `tests/integration/ai.test.ts` |
| Org A cannot access org B; unauthorized user cannot send or modify | `tests/integration/isolation.test.ts`, permission cases in each suite, E2E |
| Email: success, failure, invalid recipient, retry, duplicate-send prevention | `tests/integration/email.test.ts` (including a concurrent double-click test and a real SMTP round-trip to a local server) |
| Complete workflow | `tests/integration/workflow.test.ts`, `e2e/collections-workflow.spec.ts` |

## In progress

Nothing.

## Remaining (owner action needed)

1. Review and push the local pilot-readiness commits to PR #1.
2. Choose production hosting and PostgreSQL; set `APP_URL` (https), `DATABASE_URL`, `EMAIL_*`/`SMTP_*`, and `AI_PROVIDER=groq` + `GROQ_API_KEY`.
3. Send a real test email to your own mailbox through your SMTP provider before using it with customers.
4. Try the workflow with a few real users (per the spec, before adding features).

## Known issues and limitations

- Rate limiter is in memory (single instance only; resets on restart).
- "Today" and overdue days use UTC dates; there is no per-organization time zone.
- With a streaming loading boundary, a not-found invoice renders the 404 page with HTTP 200 (no data is shown).
- No password reset, email verification, MFA, or team member removal/role change.
- Replies are recorded manually; there is no inbound email ingestion yet (the `activities.source` column is ready for it).
- The evidence guard checks that a quote exists, not that it proves the claim; sensitive situations are always flagged for human review.
- CSV import cannot update existing invoices (duplicates are skipped).
- Column matching has only been tried with hand-written files in typical accounting-export layouts, not real QuickBooks/Xero exports. Files without a customer email column cannot be imported.
- Not tested beyond roughly 60 invoices, or in browsers other than Chromium. No real customer files or users yet.
- Bulk analysis runs synchronously, 25 invoices per click (no background job runner).

## Decisions

See [DECISIONS.md](DECISIONS.md).
