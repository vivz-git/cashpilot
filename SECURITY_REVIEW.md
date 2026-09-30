# Security review — CashPilot MVP

Scope: the whole application as of this branch. The review combined reading the code (every query in
`src/server`), automated tests, and probing a running server. Every item below that says "verified"
has a test or a manual check.

## Summary

| Area | Status |
|------|--------|
| Authentication | OK, with one fix applied (72-byte password limit), expired-session cleanup added |
| Authorization (roles) | OK — enforced in the service layer, tested for viewer/member/owner |
| Organization isolation | OK — every query filters by `organization_id`; cross-org IDs return "not found" |
| API secrets | OK — server-only, never in the client bundle (verified by grepping the production build) |
| Database access | OK — parameterised queries only; least-privilege DB role |
| Input validation | OK — Zod on every input; CSV validated per row |
| Prompt injection | Mitigated in layers (see below); residual risk documented |
| Email content handling | OK — plain text only, header-injection safe, recipient from DB only |
| Duplicate sending | OK — row lock + atomic claim + unique index + 24 h spacing; tested concurrently |
| Exposed endpoints | OK — `/api/health` plus authenticated Server Actions (CSRF-protected, verified) |
| Audit logging | OK — logins, imports, AI calls, approvals, sends, failures, outcomes, team changes |

## Findings and fixes

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| F1 | Medium | A send interrupted between claiming a draft and recording the result left the draft in `sending` forever, blocking all further reminders for that invoice. | **Fixed.** Sends unfinished after 15 min are released to `failed` with a "delivery unknown" timeline entry and audit record; only a human can retry. The email record is now written in the same transaction as the claim. Tested. |
| F2 | Low | `follow_up_count` was incremented from a value read earlier in the request (lost update under concurrency). | **Fixed.** Incremented in SQL. |
| F3 | Low | bcrypt silently ignores bytes beyond 72, so two long passwords sharing a prefix would both work. | **Fixed.** Passwords over 72 bytes are rejected. Tested. |
| F4 | Low | Expired sessions were never deleted. | **Fixed.** Purged at the user's next login. Tested. |
| F5 | Low | Default Groq model had been retired (HTTP 404), silently forcing every analysis onto the fallback. | **Fixed.** Default is now `openai/gpt-oss-120b`; verified against the live API with fake data. |
| F6 | Info | No HSTS header. | **Fixed.** `Strict-Transport-Security` sent in production. |
| F7 | Info | Server-only modules could be imported by a client component by mistake. | **Fixed.** DB, email, AI provider, session and auth modules import `server-only`. |

## Details by area

### Authentication
- Passwords: bcrypt cost 12, 10–72 bytes. Unknown emails still run a bcrypt compare (no timing oracle).
- Sessions: 256-bit random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production over HTTPS); only the SHA-256 hash is stored; 14-day expiry; logout deletes the row. Verified cookie flags on a live response.
- Rate limits: login 10 / 15 min per IP and per email; signup 5 / hour per IP.
- Residual: signup reveals whether an email is registered (rate limited). The per-email login limit could be used to lock a user out for 15 minutes. The IP key trusts the first `X-Forwarded-For` hop, so deploy behind a proxy that overwrites it.

### Authorization and organization isolation
- Every service function takes an `AuthContext` and calls `requirePermission` before any query. Viewers are read-only; only owners manage the team; the team form cannot create owners.
- Every `SELECT/UPDATE/DELETE` on tenant data includes `organization_id = ctx.orgId`. The only updates by bare primary key touch rows created or atomically claimed earlier in the same authorised request.
- Cross-organization access returns "not found" (no ID probing). Malformed IDs are rejected before querying.
- Verified by `tests/integration/isolation.test.ts`, permission tests in each suite, and the E2E test that opens another organization's invoice URL.

### Secrets
- `GROQ_API_KEY`, `SMTP_*` and `DATABASE_URL` are read only on the server; no `NEXT_PUBLIC_` variables exist. A grep of the production client bundle for key names, the Groq host, `nodemailer`, `bcrypt` and the DB URL found nothing.
- Provider errors never include response bodies or credentials. `.env` is git-ignored; `.env.example` has no values.

### Database
- Drizzle query builder / tagged `sql` templates only (parameterised). The app role `cashpilot` is not a superuser.
- Unique indexes back up application checks: invoice number per org (case-insensitive), one `sent` email per draft.

### Input validation
- Zod schemas for signup, login, team, outcomes and drafts. Control characters stripped from free text.
- CSV: 2 MB / 2,000 rows, `.csv` only, ISO dates, currency-aware amounts, email syntax, in-file duplicates. Any error blocks the import. Formula-like cells are stored as text; there is no CSV export.
- Server Action body limit 3 MB.

### Prompt injection and hallucination
Customer-controlled text (CSV notes, names, recorded replies) reaches the model. Defences:
1. It is passed only inside a JSON data block, with `<`, `>`, `&` escaped so it cannot close the block; the system prompt says data is never instructions. Tested.
2. The model has no tools and cannot send anything; every email needs a human "Approve & Send".
3. Output is schema-validated. Situations must be backed by quotes that appear verbatim in the record, and recorded facts override the model. Priority is bounded to ±3 of a fact-based score, so injected text cannot bury an invoice.
4. Drafts that threaten, cite legal action or fees, guilt-trip, omit the invoice, contain links, HTML, placeholders or unexplained account numbers are replaced with a safe template. Humans editing a draft see the same warnings live.
5. Recipient is always the invoice's stored email — never from model output or the form.

Residual risk: the guard checks that a quote exists, not that it proves the claim. Sensitive outcomes (dispute, cash-flow issue, unknown after contact) are therefore always flagged for human judgement. Invoice data (customer name, notes, activity) is sent to Groq when `AI_PROVIDER=groq`; customer email addresses are not.

### Email
- Plain text only; HTML is stripped from AI output; the subject has CR/LF removed; nodemailer file and URL access are disabled.
- SMTP requires TLS (implicit or STARTTLS) outside local development.
- Transient failures retried up to 3 times; permanent ones are not. Every attempt is recorded (`email_messages`) and audited.
- Duplicate prevention: invoice row lock → reminder-spacing check → conditional `UPDATE ... WHERE status IN ('draft','failed')` → partial unique index. Three concurrent Approve & Send calls produce exactly one email (tested).

### Exposed surface
- Routes: `/login`, `/signup`, authenticated pages, `/api/health` (no data).
- Server Actions: all check the session before doing anything. Next.js rejects cross-origin action calls — verified by replaying a captured action with `Origin: https://evil.example` (rejected, no data change) and without a cookie ("session expired", no data change).
- Headers: CSP (`frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production, `X-Powered-By` removed.
- No `dangerouslySetInnerHTML`, `eval` or `new Function` in the codebase.

### Dependencies
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm audit` (including dev) reports moderate advisories in `esbuild` pulled in by `drizzle-kit` (development server only; not shipped).

## Known limitations (accepted for the MVP)
- In-memory rate limiter: resets on restart and is per-instance. Use Redis/Postgres before scaling out.
- CSP allows inline scripts (Next.js bootstrap without nonces).
- No email verification, password reset, MFA, or session listing/revocation UI.
- No automatic reply ingestion yet; replies are recorded manually.
