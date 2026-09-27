# CashPilot

A relationship-safe accounts-receivable assistant for small B2B agencies (5–30 people). CashPilot shows which
overdue invoices need attention, suggests why a customer may not have paid, drafts a polite follow-up, and
keeps a timeline of every collection action. It never sends anything without a human clicking **Approve & Send**.

## What it does

1. **Sign up / log in.** Each user belongs to one workspace (organization). Roles: owner, member, viewer (read-only).
2. **Import invoices from CSV** with row-level validation and clear errors.
3. **Dashboard:** outstanding and overdue totals per currency, what needs attention today, the priority queue,
   promised payments and disputes.
4. **AI analysis** per invoice: priority 1–10, reason, customer situation, recommended action and tone,
   confidence, and missing information. Guardrails reject invented evidence and bound the priority.
5. **Follow-up drafting** with safety checks (no threats, legal claims or guilt-tripping; must name the invoice).
   Edit the draft before sending.
6. **Approve & Send** over authenticated SMTP, with retries, failure recording and duplicate-send prevention.
7. **Manual reply tracking:** customer replied, promised payment, dispute, dispute resolved, paid, no response, notes.
8. **Activity timeline** per invoice and an audit log of external actions.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS 4 ·
Zod · nodemailer · Vitest · Playwright. AI through a server-side provider interface (Groq or an offline mock).

## Getting started

Requirements: Node.js 20.9+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then edit values
createdb cashpilot_dev         # or create the database however you prefer
npm run db:migrate
npm run db:seed                # optional: demo workspace with fake invoices
npm run dev
```

Open http://localhost:3000. With the seed data, sign in as `demo@cashpilot.local` / `demo-password-123`.
A sample CSV is in [`e2e/fixtures/invoices.csv`](e2e/fixtures/invoices.csv).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `APP_URL` | production | Public base URL. When it starts with `https://`, session cookies are `Secure`. |
| `AI_PROVIDER` | no | `mock` (default, deterministic offline rules) or `groq`. |
| `GROQ_API_KEY` | with `groq` | Groq API key. Server-side only. |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b`. |
| `EMAIL_PROVIDER` | no | `mock` (default, records in memory, sends nothing) or `smtp`. |
| `EMAIL_FROM` | with `smtp` | From header, e.g. `Accounts <billing@youragency.com>`. Replies go to the approving user. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | with `smtp` | Authenticated SMTP server. |
| `SMTP_SECURE` | no | `true` for implicit TLS (port 465); otherwise STARTTLS is required. |
| `SMTP_ALLOW_INSECURE` | no | `true` allows plaintext SMTP to a local test server. Ignored in production. |
| `TEST_DATABASE_URL` | tests | Separate database for the test suite (name must contain `test`). |
| `E2E_DATABASE_URL` | e2e | Separate database for browser tests (default `cashpilot_e2e`). |

### CSV format

Required columns: `customer_name, customer_email, invoice_number, invoice_date, due_date, amount, currency`.
Optional: `account_manager, notes`. Dates are `YYYY-MM-DD`; amounts are decimals without currency symbols; currency
is an ISO code. Any invalid row blocks the whole import, with every error listed by line and column. Invoice numbers
that already exist are skipped, never overwritten.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` / `build` / `start` | Run the app. |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts`. |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:seed` | Create a demo workspace with fake invoices (refuses to run in production). |
| `npm run typecheck` / `lint` | Static checks. |
| `npm test` | Unit and integration tests (needs PostgreSQL and `TEST_DATABASE_URL`). |
| `npm run test:e2e` | Builds the app and runs the Playwright browser tests against `E2E_DATABASE_URL`. |

## Project layout

```
src/app/            Pages, layouts and Server Actions (thin: auth + call a service)
src/server/         Business logic. Every function takes an AuthContext and scopes queries to the organization.
  auth/             Sessions, signup/login, roles
  invoices/         CSV parsing, import, dashboard queries, manual outcomes
  ai/               Provider interface, prompts, guardrails, rule-based fallback, drafting safety checks
  email/            SMTP/mock providers, Approve & Send, interrupted-send recovery
src/db/             Drizzle schema and connection
drizzle/            SQL migrations
tests/              Vitest unit + integration tests (real PostgreSQL)
e2e/                Playwright browser tests
```

## Documentation

- [PROGRESS.md](PROGRESS.md) — status, remaining work and known issues
- [DECISIONS.md](DECISIONS.md) — assumptions and design decisions
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md) — security review, fixes and accepted limitations
