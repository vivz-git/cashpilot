# CashPilot landing page

Single-page validation site for early customer discovery and outreach. It is a
standalone Next.js app, exported as static HTML, and is independent of the
CashPilot product code.

## Develop

```bash
cd landing
npm install
npm run dev        # http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm run lint
npm run build      # static export to landing/out/
```

`landing/out/` can be deployed to any static host (Vercel, Netlify, Cloudflare
Pages, S3 + CloudFront).

## Configuration

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the site. Used for canonical, Open Graph, robots and sitemap URLs. Set this before deploying. |
| `NEXT_PUBLIC_EARLY_ACCESS_ENDPOINT` | Optional. URL the early access form POSTs JSON to. |

Both are read at build time.

### Early access submissions

Submissions are **not sent anywhere yet**. The form validates input, and then:

- **No endpoint set (default):** the request is saved to the visitor's
  `localStorage` (`cashpilot:early-access-requests`) and the confirmation
  says it has not been sent.
- **Endpoint set:** the request is POSTed as JSON:

  ```json
  {
    "name": "…",
    "email": "…",
    "company": "…",
    "companyType": "Creative studio",
    "overdue": "$10k – $50k",
    "message": "…",
    "submittedAt": "2026-01-01T00:00:00.000Z"
  }
  ```

  Any non-2xx response shows an error and keeps the form filled in.

The integration point is `submitEarlyAccess()` in `src/lib/early-access.ts`.
A hidden honeypot field drops basic bot submissions.

## Product preview

`src/components/ProductPreview.tsx` is an HTML mockup with sample data, labelled
as illustrative on the page. Replace it with a screenshot of the real app once
the UI is available.

## Screenshots

`docs/screenshots/` has desktop (1440px) and mobile (390px) captures of the page
and form states.
