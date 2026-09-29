# Prospects

Status: dataset not present in this checkout. See [research_log.md](research_log.md).

## What we know from the prior research session

A previous (undocumented-in-repo) research pass reviewed ~75 companies and retained 50 prospects. That raw list — company names, URLs, contact rows — is **not** in this repository and has not been reconstructed here. Nothing below should be read as containing or replacing that data.

### Segment composition (of the 50 retained)

| Dimension | Breakdown |
|---|---|
| Geography | 34 UK, 15 US, 1 both |
| Fit tier | 23 A-fit, 24 B-fit, 3 C-fit |
| Verification confidence | 22 High, 25 Medium, 3 Low |
| Contactability | 21/50 had a generic business email listed on their own site; no named-person emails were collected |

### Fit methodology (as previously defined — see [customer_qualification.md](customer_qualification.md) for the working rubric)

Fit tiers were assigned based on company size, retainer-based billing, and presence of a distinct finance/ops function. This session did not re-derive or audit that methodology against the (missing) raw data — it is stated here as prior context, not re-verified.

### Promising sub-niches identified

1. B2B/technology PR agencies on retainers
2. HubSpot/inbound agencies serving manufacturers or professional-services clients
3. Media-buying/performance agencies that front media costs on behalf of clients

### Known limitation

Company-specific evidence of overdue invoices or payment pain was generally thin in the prior pass. Industry-level pain evidence (retainer/relationship dynamics, fronted costs) was stronger than company-specific evidence. Treat any "this company has an AR problem" claim as unverified unless backed by a discovery-call note in [customer_pipeline.md](customer_pipeline.md).

## What remains to recover

- The original 50-row prospect list (company, URL, geography, fit tier, verification confidence, contact email).
- Named contacts at any of the 50 companies (none were collected originally).
- Confirmation of whether the 75-company source list still exists anywhere, or whether re-sourcing is required.

## Suggested `prospects.csv` schema

For when the dataset is recovered or rebuilt:

```
company_name,website,country,employee_count_est,segment,fit_tier,verification_confidence,contact_email,contact_name,contact_role,source,date_added,notes
```

- `fit_tier`: A / B / C, per [customer_qualification.md](customer_qualification.md)
- `verification_confidence`: High / Medium / Low
- `source`: how the company was found (directory, referral, LinkedIn search, etc.)
- No row should be added with fabricated contact details — leave `contact_email`/`contact_name` blank rather than guessing.
