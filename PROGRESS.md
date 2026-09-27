# Progress

## Implementation plan

1. **Foundation** – Next.js app, Drizzle schema + migrations, auth (signup/login/logout, sessions), organizations and roles, org-scoped service layer, rate limiting.
2. **Invoice import** – CSV parsing and validation with row-level errors, duplicate handling, multi-currency.
3. **Invoice database and dashboard** – outstanding totals per currency, needs-attention-today, priority table, promised-to-pay, disputed.
4. **AI analysis** – provider abstraction (Groq / mock), structured output with validation, evidence-based hallucination guard, prompt-injection defences.
5. **Follow-up drafting** – AI draft + safety checks, editing, "Approve & Send" only.
6. **Email** – SMTP + mock providers, delivery records, retries, duplicate-send prevention.
7. **Reply tracking and timeline** – manual outcomes, activity timeline, audit log.
8. **Tests** – unit, integration (real Postgres), E2E (Playwright).
9. **Security review and quality pass.**

## Status

### Completed
- Phase 1: repository inspected (empty), stack chosen, plan and decision log written.

### In progress
- Phase 2: foundation.

### Remaining
- Phases 2–9 above.

### Known issues
- None yet.

### Decisions
See [DECISIONS.md](./DECISIONS.md).
