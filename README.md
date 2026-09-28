# CashPilot

CashPilot helps small agencies chase unpaid invoices without sounding like a debt collector.

It shows which overdue invoices need attention, drafts a polite reminder email, and never sends anything until you click **Approve & Send**.

![CashPilot dashboard](docs/dashboard.png)

## What it does

- **Import invoices** from a CSV file.
- **See what matters** on one dashboard: money outstanding, what needs attention today, and the highest-priority invoices.
- **AI analysis** explains why an invoice might be unpaid and what to do next.
- **Draft a follow-up email** — you can edit it, and unsafe wording (threats, guilt-tripping, legal language) is automatically blocked.
- **Approve & Send** — the only way an email goes out. Nothing sends itself.
- **Track replies** by hand: promised payment, dispute, paid, no response.
- **See the full history** of every invoice in a timeline.

Everyone signs in under one workspace per company. You can add teammates as members (can send) or viewers (read-only).

## Run it locally

You need Node.js 20.9+ and PostgreSQL.

```bash
npm install
cp .env.example .env          # edit this with your database URL
createdb cashpilot_dev
npm run db:migrate
npm run db:seed               # optional: adds a demo workspace with fake invoices
npm run dev
```

Open http://localhost:3000. If you ran the seed command, sign in with:

```
demo@cashpilot.local / demo-password-123
```

## Setting it up for real use

By default, CashPilot runs in "offline mode": AI analysis uses simple built-in rules, and emails are only recorded, never sent. To use it for real:

1. Set `AI_PROVIDER=groq` and `GROQ_API_KEY=...` in `.env` for real AI analysis.
2. Set `EMAIL_PROVIDER=smtp` and your `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` to actually send emails.

Full list of settings: [`.env.example`](.env.example).

## CSV format

Required columns: `customer_name, customer_email, invoice_number, invoice_date, due_date, amount, currency`.
Optional: `account_manager, notes`.

Dates look like `2026-07-31`. Amounts are plain numbers like `1250.00`, no currency symbols. Currency is a 3-letter code like `USD` or `EUR`. See an example file: [`e2e/fixtures/invoices.csv`](e2e/fixtures/invoices.csv).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` / `npm start` | Build and run for production |
| `npm test` | Run the automated tests |
| `npm run test:e2e` | Run the browser tests |
| `npm run db:migrate` | Apply database changes |
| `npm run db:seed` | Add demo data |

## Built with

Next.js, TypeScript, PostgreSQL, Tailwind CSS. AI runs through Groq (or an offline mode with no external calls).

## More details

- [PROGRESS.md](PROGRESS.md) — what's done and what's left
- [DECISIONS.md](DECISIONS.md) — choices made while building this
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md) — security review and fixes
