import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { ATTENTION_LABELS, SITUATION_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { InvoiceRow } from "@/server/invoices/queries";
import { Badge, PriorityBadge } from "./ui";

export function SituationBadge({ situation }: { situation: InvoiceRow["aiSituation"] }) {
  if (!situation) return <span className="text-sm text-slate-400">Not analyzed</span>;
  const tone =
    situation === "dispute" ? "red" : situation === "promised_payment" ? "green" : situation === "unknown" ? "gray" : "blue";
  return <Badge tone={tone} dot>{SITUATION_LABELS[situation]}</Badge>;
}

export function OverdueCell({ days }: { days: number }) {
  if (days === 0) return <span className="text-slate-500">Not due</span>;
  return <span className={`num ${days > 60 ? "font-semibold text-red-700" : days > 30 ? "font-medium text-amber-800" : "text-slate-700"}`}>{days}d</span>;
}

/**
 * Recorded facts win over a stored AI recommendation (DECISIONS.md D33): an open dispute is always
 * shown as a dispute, and a recommendation made before newer activity is marked as out of date.
 */
function guidance(inv: InvoiceRow): { badge: React.ReactNode; text: React.ReactNode } {
  if (inv.disputeStatus === "open") {
    return {
      badge: <Badge tone="red" dot>Disputed</Badge>,
      text: <span className="text-slate-700">Customer disputes this invoice. Resolve the dispute before sending a payment reminder.</span>,
    };
  }
  return {
    badge: <SituationBadge situation={inv.aiSituation} />,
    text: inv.analysisOutdated ? (
      <span className="text-amber-800" data-testid="analysis-outdated">
        New activity since the last analysis. Re-analyze for an up-to-date recommendation.
      </span>
    ) : inv.aiRecommendedAction ? (
      <span className="text-slate-700">{inv.aiRecommendedAction}</span>
    ) : (
      <span className="text-slate-400">Analyze to get a recommended next step.</span>
    ),
  };
}

function WhenCell({ inv, showAttention }: { inv: InvoiceRow; showAttention: boolean }) {
  if (showAttention && inv.attention) {
    return <Badge tone={inv.attention === "promise_broken" ? "amber" : "blue"}>{ATTENTION_LABELS[inv.attention]}</Badge>;
  }
  return <span className="text-slate-600">{formatDate(inv.nextFollowUpDate)}</span>;
}

/** Outstanding invoices: a table on wide screens, stacked cards on phones and tablets. */
export function InvoiceTable({ rows, showAttention = false }: { rows: InvoiceRow[]; showAttention?: boolean }) {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500">
            <tr>
              <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Priority</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Customer · invoice</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Overdue</th>
              <th scope="col" className="w-[40%] px-3 py-2.5 font-medium">Situation · recommended action</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Follow-ups</th>
              <th scope="col" className="py-2.5 pl-3 pr-5 font-medium">{showAttention ? "Why today" : "Next follow-up"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((inv) => {
              const g = guidance(inv);
              return (
                <tr key={inv.id} className="align-top transition-colors hover:bg-slate-50/80">
                  <td className="py-3.5 pl-5 pr-3">
                    <PriorityBadge score={inv.aiPriority} />
                  </td>
                  <td className="max-w-[240px] px-3 py-3.5">
                    <p className="truncate font-medium text-ink" title={inv.customerName}>{inv.customerName}</p>
                    <Link className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline" href={`/invoices/${inv.id}`}>
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-3.5 text-right font-medium text-ink">{formatMoney(inv.amountMinor, inv.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right">
                    <OverdueCell days={inv.daysOverdue} />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex flex-col items-start gap-1.5">
                      {g.badge}
                      <span className="line-clamp-2 leading-snug">{g.text}</span>
                    </div>
                  </td>
                  <td className="num px-3 py-3.5 text-right text-slate-700">{inv.followUpCount}</td>
                  <td className="whitespace-nowrap py-3.5 pl-3 pr-5">
                    <WhenCell inv={inv} showAttention={showAttention} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 lg:hidden">
        {rows.map((inv) => {
          const g = guidance(inv);
          return (
            <li key={inv.id} className="relative px-4 py-4 transition-colors hover:bg-slate-50/80 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{inv.customerName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <Link
                      className="font-medium text-brand-700 after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-brand-600"
                      href={`/invoices/${inv.id}`}
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <span>{inv.daysOverdue === 0 ? "Not due" : <><OverdueCell days={inv.daysOverdue} /> overdue</>}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-[0.9375rem] font-semibold text-ink">{formatMoney(inv.amountMinor, inv.currency)}</span>
                  <PriorityBadge score={inv.aiPriority} />
                </div>
              </div>
              <div className="mt-3 flex flex-col items-start gap-1.5 text-sm">
                {g.badge}
                <span className="leading-snug">{g.text}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>
                  <span className="num">{inv.followUpCount}</span> follow-up{inv.followUpCount === 1 ? "" : "s"}
                </span>
                {showAttention && inv.attention ? (
                  <WhenCell inv={inv} showAttention />
                ) : (
                  inv.nextFollowUpDate && <span>Next follow-up {formatDate(inv.nextFollowUpDate)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
