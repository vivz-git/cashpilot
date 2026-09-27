# Progress

_Last updated: 2026-09-27_

## Status: MVP complete and verified locally

Push to GitHub is currently **blocked** (HTTP 403: the Claude GitHub App has no write access to
`vivz-git/CashPilot`). All work is committed on the local branch `claude/peaceful-dijkstra-vgphzy`.

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

### Latest results

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm test`: **135 passed**, 0 failed (10 files)
- `npm run test:e2e`: **6 passed**, 0 failed
- `npm audit --omit=dev`: 0 vulnerabilities
- Live Groq check (fake data): valid structured output, injected instruction ignored, drafts passed safety checks

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

1. Grant the Claude GitHub App write access to `vivz-git/CashPilot` (or push the branch yourself), then open the draft PR.
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
- Bulk analysis runs synchronously, 25 invoices per click (no background job runner).

## Decisions

See [DECISIONS.md](DECISIONS.md).
