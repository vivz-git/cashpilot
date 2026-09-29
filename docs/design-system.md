# CashPilot design system

CashPilot is a finance tool for agency owners and finance leads. The interface should feel calm, credible
and precise: restrained colour, clear hierarchy, and nothing that competes with the numbers.

## Principles

1. **Answer the workflow in order.** What needs attention → why → what to do → review the draft →
   approve & send → record the outcome. Each screen puts the next action first.
2. **Facts before advice.** Recorded disputes, promises and newer activity are shown over stored AI advice.
   Confidence, source ("offline mode", "fallback") and test mode are always visible, never hidden.
3. **Colour means something.** Status colours are only used for status, never for decoration.
4. **Every number lines up.** Money, counts and dates use tabular figures.

## Tokens (`src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `font-sans` | Geist (via `next/font`, self-hosted) | All text |
| `font-mono` | Geist Mono | CSV examples, code |
| `canvas` | `#f5f6f8` | Page background |
| `ink` | `#0b1220` | Headings and primary text |
| Neutrals | Tailwind `slate` only | Secondary text, borders, surfaces |
| `brand-50…900` | Deep teal, `brand-700` = `#0f5f56` | Primary buttons, links, focus rings, current step |
| `shadow-card` / `shadow-raised` | Soft, slate-tinted | Cards / floating panels |

### Status colours

| Meaning | Colour | Examples |
|---|---|---|
| Urgent, disputed, failed | red | Priority 8–10, "Disputed", >60 days overdue, send failure |
| Needs attention, warning | amber | Priority 5–7, promise passed, safety warnings, test mode |
| Done, paid, promised, sent | emerald | "Paid", "Promised payment", completed steps |
| Neutral / informational | slate or brand | "Unknown", "Open", attention reasons |

## Type scale

- Page title: `text-2xl`/`28px`, semibold, tight tracking.
- Card title: `15px` semibold; card description `text-sm` slate-500.
- Body: `text-sm`; labels `text-xs` medium slate-500 (sentence case, no all-caps).
- Key amount on the invoice page: `text-3xl` semibold, tabular.

## Components (`src/components`)

| Component | Notes |
|---|---|
| `PageHeader` | Title, description, right-aligned actions, optional back link |
| `Card` | `rounded-xl`, 1px border, `shadow-card`; `flush` for edge-to-edge tables and lists |
| `Badge` | Tones above; optional status `dot` |
| `PriorityBadge` | Always shows `n/10` as text; level (high/medium/low) in tooltip and for screen readers |
| `Alert` | error / warning / success / info, with icon; errors use `role="alert"` |
| `EmptyState` | Icon, sentence, optional action |
| `InvoiceTable` | Table at `lg` (≥1024px); stacked cards below, so amount and action are never scrolled off-screen |
| `buttonClass` | `primary` (brand), `secondary` (outlined), `ghost`; visible focus ring, 1px press |
| `NavLinks` | Top navigation with `aria-current="page"` |
| Icons | Small inline SVG set, 1.5 stroke (`icons.tsx`); no icon dependency |

## Layout

- Top navigation, content max-width `7xl`, gutters 16/24/32px.
- Dashboard: attention metric first, "Needs attention today" list, promised/disputed side by side, full priority list.
- Invoice: header with amount, step tracker, then analysis → email → sent history on the left;
  details, outcome and timeline on the right (stacked below `lg`).

## Accessibility

Skip link, visible focus rings, labelled form controls, status never conveyed by colour alone,
`aria-current` for navigation and steps, reduced-motion respected for smooth scrolling.
