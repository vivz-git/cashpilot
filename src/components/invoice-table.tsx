import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { ATTENTION_LABELS, SITUATION_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { InvoiceRow } from "@/server/invoices/queries";
import { Badge, PriorityBadge } from "./ui";

export function SituationBadge({ situation }: { situation: InvoiceRow["aiSituation"] }) {
  if (!situation) return <span className="text-slate-400">Not analyzed</span>;
  const tone =
    situation === "dispute" ? "red" : situation === "promised_payment" ? "green" : situation === "unknown" ? "gray" : "blue";
  return <Badge tone={tone}>{SITUATION_LABELS[situation]}</Badge>;
}

export function OverdueCell({ days }: { days: number }) {
  if (days === 0) return <span className="text-slate-500">Not due</span>;
  return <span className={`num ${days > 60 ? "font-semibold text-red-700" : days > 30 ? "text-amber-800" : ""}`}>{days}d</span>;
}

export function InvoiceTable({ rows, showAttention = false }: { rows: InvoiceRow[]; showAttention?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Priority</th>
            <th className="px-2 py-2 font-medium">Invoice</th>
            <th className="px-2 py-2 font-medium">Customer</th>
            <th className="px-2 py-2 text-right font-medium">Amount</th>
            <th className="px-2 py-2 text-right font-medium">Overdue</th>
            <th className="px-2 py-2 font-medium">Situation</th>
            <th className="px-2 py-2 font-medium">Recommended action</th>
            <th className="px-2 py-2 text-right font-medium">Follow-ups</th>
            <th className="px-4 py-2 font-medium">{showAttention ? "Why today" : "Next follow-up"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((inv) => (
            <tr key={inv.id} className="align-top hover:bg-slate-50">
              <td className="px-4 py-2">
                <PriorityBadge score={inv.aiPriority} />
              </td>
              <td className="px-2 py-2">
                <Link className="font-medium text-blue-700 hover:underline" href={`/invoices/${inv.id}`}>
                  {inv.invoiceNumber}
                </Link>
              </td>
              <td className="max-w-[180px] truncate px-2 py-2" title={inv.customerName}>
                {inv.customerName}
              </td>
              <td className="num whitespace-nowrap px-2 py-2 text-right">{formatMoney(inv.amountMinor, inv.currency)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                <OverdueCell days={inv.daysOverdue} />
              </td>
              <td className="px-2 py-2">
                <SituationBadge situation={inv.aiSituation} />
              </td>
              <td className="max-w-[320px] px-2 py-2 text-slate-700">
                <span className="line-clamp-2">{inv.aiRecommendedAction ?? <span className="text-slate-400">—</span>}</span>
              </td>
              <td className="num px-2 py-2 text-right">{inv.followUpCount}</td>
              <td className="whitespace-nowrap px-4 py-2">
                {showAttention && inv.attention ? (
                  <Badge tone={inv.attention === "promise_broken" ? "amber" : "blue"}>{ATTENTION_LABELS[inv.attention]}</Badge>
                ) : (
                  formatDate(inv.nextFollowUpDate)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
