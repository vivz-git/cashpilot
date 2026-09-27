import type { Metadata } from "next";
import Link from "next/link";
import { analyzeOutstandingAction } from "@/app/actions/invoices";
import { ActionButton } from "@/components/action-button";
import { InvoiceTable } from "@/components/invoice-table";
import { Badge, buttonClass, Card, EmptyState } from "@/components/ui";
import { getDb } from "@/db";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { requireSession } from "@/server/auth/session";
import { getDashboard } from "@/server/invoices/queries";

export const metadata: Metadata = { title: "Dashboard" };

function Metric({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-xl font-semibold text-slate-900">{children}</div>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const d = await getDashboard(getDb(), session.ctx);
  const canWrite = can(session.ctx, "write");
  const today = todayIso();

  if (d.openCount === 0 && d.paidCount === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <EmptyState title="No invoices yet">
          {canWrite ? (
            <>
              <Link className="font-medium text-blue-700 hover:underline" href="/import">Import a CSV of your open invoices</Link> to see what needs attention.
            </>
          ) : (
            "A teammate needs to import invoices first."
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">{formatDate(today)} · {d.openCount} outstanding invoice{d.openCount === 1 ? "" : "s"}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton action={analyzeOutstandingAction} pendingText="Analyzing…" variant={d.unanalyzedCount > 0 ? "primary" : "secondary"}>
              {d.unanalyzedCount > 0 ? `Analyze ${d.unanalyzedCount} new invoice${d.unanalyzedCount === 1 ? "" : "s"}` : "Refresh analysis"}
            </ActionButton>
            <Link href="/import" className={buttonClass.secondary}>Import CSV</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Outstanding" hint={d.totals.length > 1 ? "Per currency, not converted" : undefined}>
          {d.totals.length === 0 ? "—" : (
            <div className="space-y-0.5" data-testid="metric-outstanding">
              {d.totals.map((t) => (
                <div key={t.currency} className="num">{formatMoney(t.outstandingMinor, t.currency)}</div>
              ))}
            </div>
          )}
        </Metric>
        <Metric label="Overdue">
          {d.totals.length === 0 ? "—" : (
            <div className="space-y-0.5">
              {d.totals.map((t) => (
                <div key={t.currency} className="num">
                  {formatMoney(t.overdueMinor, t.currency)} <span className="text-xs font-normal text-slate-500">({t.overdueCount})</span>
                </div>
              ))}
            </div>
          )}
        </Metric>
        <Metric label="Needs attention today"><span className="num" data-testid="metric-attention">{d.needsAttention.length}</span></Metric>
        <Metric label="Promised to pay"><span className="num">{d.promised.length}</span></Metric>
        <Metric label="Disputed"><span className="num">{d.disputed.length}</span></Metric>
      </div>

      {d.unanalyzedCount > 0 && (
        <p className="text-sm text-slate-600">
          <Badge tone="amber">{d.unanalyzedCount} not analyzed</Badge>{" "}
          Unanalyzed invoices appear after analyzed ones in the priority order.
        </p>
      )}

      <Card title={`Needs attention today (${d.needsAttention.length})`}>
        {d.needsAttention.length === 0 ? (
          <EmptyState title="Nothing needs attention today." />
        ) : (
          <InvoiceTable rows={d.needsAttention} showAttention />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Promised to pay (${d.promised.length})`}>
          {d.promised.length === 0 ? (
            <EmptyState title="No payment promises recorded." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.promised.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/invoices/${inv.id}`} className="font-medium text-blue-700 hover:underline">{inv.invoiceNumber}</Link>{" "}
                    <span className="text-slate-600">{inv.customerName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num">{formatMoney(inv.amountMinor, inv.currency)}</span>
                    <Badge tone={inv.promiseToPayDate! < today ? "amber" : "green"}>
                      {inv.promiseToPayDate! < today ? "Passed " : "By "}{formatDate(inv.promiseToPayDate)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Disputed (${d.disputed.length})`}>
          {d.disputed.length === 0 ? (
            <EmptyState title="No open disputes." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.disputed.map((inv) => (
                <li key={inv.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/invoices/${inv.id}`} className="font-medium text-blue-700 hover:underline">{inv.invoiceNumber}</Link>{" "}
                      <span className="text-slate-600">{inv.customerName}</span>
                    </div>
                    <span className="num">{formatMoney(inv.amountMinor, inv.currency)}</span>
                  </div>
                  {inv.disputeReason && <p className="mt-0.5 line-clamp-2 text-slate-500">{inv.disputeReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="All outstanding invoices by priority">
        {d.priority.length === 0 ? <EmptyState title="Every invoice is paid." /> : <InvoiceTable rows={d.priority} />}
      </Card>
    </div>
  );
}
