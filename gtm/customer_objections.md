# Customer Objections

Anticipated objections and response hypotheses. **None of these have been heard from a real prospect yet** — this is a preparation document, not a record of objections actually raised. Update with real quotes once discovery calls happen (see [customer_discovery_guide.md](customer_discovery_guide.md)).

| Anticipated objection | Response hypothesis | Confidence |
|---|---|---|
| "QuickBooks/Xero already drafts reminders for us" | Acknowledge directly — see [competitive_landscape.md](competitive_landscape.md) and [positioning_hypotheses.md](positioning_hypotheses.md). The differentiation bet is triage/context/relationship-safety, not "AI writes a reminder," which is no longer novel. If the prospect doesn't see value beyond reminder drafting, that's a real disconfirming signal, not an objection to argue past. | Untested |
| "We don't want AI talking to our clients" | CashPilot never sends without human approval (see [README.md](../README.md)) — this is a product principle, not a workaround. | Untested |
| "Our account leads handle this personally, a tool would feel impersonal" | This is exactly hypothesis H4 (relationship risk) — worth exploring as signal, not overcoming as an objection. | Untested |
| "We're too small / don't have enough overdue invoices to justify a tool" | May be a genuine disqualifier for very small agencies; do not push past it — better data for [customer_qualification.md](customer_qualification.md) fit tiers. | Untested |
| "How do you handle our client data / security?" | Point to [SECURITY_REVIEW.md](../SECURITY_REVIEW.md) — org isolation, no data sent to AI provider beyond invoice/customer text (not email addresses), plain-text-only emails. Be honest about current limitations (no SOC2, no MFA, etc. — see the same doc's "Known limitations"). | Untested |
| "What does this cost?" | Do not price during discovery calls (see [validation_plan.md](validation_plan.md)). If pushed, say pricing isn't set and you're in a research phase. | N/A — policy, not a hypothesis |

## Note on percentage-of-recovered-cash pricing

If a prospect proposes or seems to expect contingency/percentage-of-recovered pricing, log it as a signal in [interview_scorecard.csv](interview_scorecard.csv) rather than agreeing to it — see [pricing_research.md](pricing_research.md) for why that model isn't the default hypothesis.
