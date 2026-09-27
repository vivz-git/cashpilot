# Decisions

Assumptions and design decisions made while building the CashPilot MVP
autonomously. Each entry lists the decision and the reasoning. Revisit any of
these after testing with real users.

## Stack

| # | Decision | Reasoning |
|---|----------|-----------|
| D1 | Next.js 16 (App Router) + React 19 + TypeScript 5.9 | Preferred stack in the spec. TypeScript 7 was released but pinned to 5.9 for tooling compatibility. |
| D2 | PostgreSQL 16 + Drizzle ORM (`pg` driver) instead of Prisma | "Prisma or equivalent" was allowed. Drizzle needs no engine binary download, generates plain SQL migrations that are easy to review, and keeps queries explicit (useful for auditing org isolation). |
| D3 | Server Actions for all mutations; no public JSON API | Fewer externally exposed endpoints. Next.js checks the `Origin` header on Server Actions (CSRF protection). The only route handler is `/api/health`. |
| D4 | Tailwind CSS 4, no component library | Clean finance-tool look with minimal dependencies. |
| D5 | Vitest (unit + integration against a real Postgres test DB) and Playwright (E2E) | Integration tests run against real SQL so isolation and race conditions are tested for real, not mocked. |
| D6 | Playwright pinned to 1.56.1 | Matches the Chromium build pre-installed in the environment (`chromium-1194`). |

## Auth and tenancy

| # | Decision | Reasoning |
|---|----------|-----------|
| D10 | Custom email/password auth with bcrypt (cost 12) and DB-backed sessions | Small, auditable, no third-party accounts needed. The session token is 32 random bytes; only its SHA-256 hash is stored. Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, 14-day expiry. |
| D11 | Signup creates a new organization and makes the user its `owner` | "Users belong to one organization." There is no self-service join; owners add teammates from the Team page. |
| D12 | Roles: `owner`, `member`, `viewer` | Needed to test "unauthorized user cannot send email / modify invoices". Viewers are read-only. Members and owners can import, analyze, draft, send and record activity. Only owners can add teammates. |
| D13 | Every data access goes through `src/server/*` services that take an `AuthContext` (`orgId`, `userId`, `role`) and always filter by `organization_id` | Organization isolation enforced in one place; cross-org IDs resolve to "not found" rather than "forbidden" so IDs cannot be probed. |
| D14 | In-memory fixed-window rate limiter | Adequate for a single-instance MVP. Must be replaced with a shared store (Redis/Postgres) before running multiple instances. Applied to login, signup, CSV import, AI calls and email sends. |

## Invoices and CSV import

| # | Decision | Reasoning |
|---|----------|-----------|
| D20 | Amounts stored as integer minor units (`amount_minor`) + ISO-4217 `currency` | Avoids floating point errors. Minor-unit exponent comes from `Intl.NumberFormat` (e.g. JPY has 0 decimals). |
| D21 | No currency conversion; totals are shown per currency | FX conversion would invent numbers. Multiple currencies are displayed side by side. |
| D22 | Dates must be ISO `YYYY-MM-DD` | `03/04/2026` is ambiguous (US vs UK). Rejecting it with a clear error is safer than guessing. |
| D23 | Validation errors block the whole import; nothing is written | Avoids half-imported files. The error list shows row number, column and a readable message so the user can fix the file and re-upload. |
| D24 | Invoice numbers that already exist in the organization are skipped and reported (not an error); duplicates *within* the same file are an error | Re-uploading an accounting export should not fail, but must not overwrite data silently or create duplicates. Updating existing invoices from CSV is out of scope. |
| D25 | Limits: 2 MB file, 2,000 rows | Protects the server; far above a 5–30 person agency's open invoice count. |
| D26 | `days_overdue` is computed at read time from `due_date`, not stored | A stored value goes stale every day. |
| D27 | Invoice `status` is `open` or `paid`; dispute state is a separate `dispute_status` (`none`, `open`, `resolved`) | Matches the spec's separate "status" and "dispute status" fields. |
| D28 | CSV cells starting with `=`, `+`, `-`, `@` are stored as text; no CSV export exists | Formula injection only matters on export; there is none. |

## AI

| # | Decision | Reasoning |
|---|----------|-----------|
| D30 | AI provider behind `AiProvider` interface with two implementations: `groq` (OpenAI-compatible chat completions, JSON mode) and `mock` (deterministic rules) | `GROQ_API_KEY` is available in the environment. `mock` is used by tests and when no key is configured so the app works offline. |
| D31 | All AI output is validated with Zod; invalid output → one retry → deterministic rule-based fallback marked `source = fallback` with low confidence | Never trust raw model output. |
| D32 | Hallucination guard: the model must cite `evidence` as verbatim quotes from the provided context. Any situation other than `no_response`/`unknown` whose evidence cannot be found in the context is downgraded to `unknown`, confidence set to `low`, and the missing information recorded | Enforces "never invent information" in code rather than trusting the prompt. |
| D33 | Structured facts override the model: an open dispute always yields `dispute`; a recorded promise-to-pay date yields `promised_payment`; `no_response` requires at least one sent reminder with no recorded reply | These are facts in our database, so the model cannot contradict them. |
| D34 | Customer-provided text (notes, names, account manager, replies) is passed only inside a JSON data block, delimited and labelled untrusted; the system prompt states it must never be followed as instructions | Prompt-injection defence layer 1. Layer 2 is D31/D32 validation; layer 3 is that the model has no tools and can never send anything (human approval is required). |
| D35 | Draft safety check: generated drafts are scanned for threatening/legal/guilt language, must include the invoice number, and are plain text. If the model output fails the check, a safe template is used instead | "Avoid threatening language / legal claims / guilt-based manipulation." User edits are also scanned and warnings are shown, but a human may still send after reviewing. |
| D36 | Priority score (1–10) comes from the model but is validated; the fallback uses a transparent formula (days overdue, amount, follow-ups) | Spec requires the AI priority; the fallback keeps the queue usable if the provider is down. |
| D37 | "When uncertain, escalate to a human": low-confidence or `unknown` results set recommended action to human review and are flagged in the UI | Product constraint. |
| D38 | Bulk "Analyze outstanding" runs synchronously in a Server Action, capped at 25 invoices per click | No job queue needed at MVP scale; avoids long-running requests. A background job runner can replace it later. |

## Email

| # | Decision | Reasoning |
|---|----------|-----------|
| D40 | `EmailProvider` interface with `smtp` (nodemailer, authenticated SMTP) and `mock` (records to memory, never leaves the process) | Spec: "simple authenticated SMTP integration". No real emails are sent in development or tests. Tests exercise the real SMTP code path against a local in-process SMTP server. |
| D41 | Plain-text emails only; subject CR/LF stripped; HTML tags removed from AI output; bodies rendered as text in the UI | Safe handling of email HTML. |
| D42 | Recipient always comes from the invoice record, never from AI output or the form | Prevents injected text from redirecting emails. |
| D43 | One "Approve & Send" action. Draft transitions `draft → sending → sent/failed` using an atomic conditional `UPDATE ... WHERE status = 'draft'` | Duplicate-send prevention even under double clicks or concurrent requests. |
| D44 | Transient SMTP failures (4xx / network) retried up to 3 attempts with short backoff; permanent failures (5xx, invalid recipient) not retried. A failed draft can be retried manually by the user | "Retry behavior" requirement without silent repeated sends. |
| D45 | At most one reminder per invoice per 24 hours | Relationship safety: prevents accidental double reminders from separate drafts. |
| D46 | Every send attempt writes an `email_messages` row (sent_at, recipient, subject, body, invoice, user, delivery status, error) and an audit log entry | Audit logs for external actions. |

## Reply tracking and timeline

| # | Decision | Reasoning |
|---|----------|-----------|
| D50 | Manual outcome recording: customer replied, promised payment (date required), dispute (reason), paid, no response. Each writes an `activities` row with `source = 'manual'` | The `source` column allows `email_inbound` later without schema changes. |
| D51 | After a send: `follow_up_count += 1`, `last_contact_at = now`, `next_follow_up_date = today + 7` | Conservative cadence. Promise-to-pay sets next follow-up to the day after the promised date. A dispute clears the next follow-up (human handles it). |
| D52 | "Needs attention today" = open, not disputed, and (next follow-up date ≤ today, or overdue with no contact yet, or promise date passed) | Answers dashboard question 2 with transparent rules. |
