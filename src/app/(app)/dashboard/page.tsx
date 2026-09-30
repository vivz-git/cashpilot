import type { Metadata } from "next";
import Link from "next/link";
import { analyzeOutstandingAction } from "@/app/actions/invoices";
import { ActionButton } from "@/components/action-button";
import { CheckIcon, ClockIcon, InboxIcon, UploadIcon } from "@/components/icons";
import { InvoiceTable } from "@/components/invoice-table";
import { Badge, buttonClass, Card, EmptyState, linkClass, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { requireSession } from "@/server/auth/session";
import { getDashboard } from "@/server/invoices/queries";

export const metadata: Metadata = { title: "Dashboard" };

function Metric({
  label,
  children,
  hint,
  emphasis = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 shadow-card ${
        emphasis ? "border-brand-200 bg-brand-50/60" : "border-slate-200/80 bg-white"
      }`}
    >
      <p className={`text-xs font-medium ${emphasis ? "text-brand-800" : "text-slate-500"}`}>{label}</p>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{children}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const GETTING_STARTED = [
  { title: "Import your open invoices", body: "Upload a CSV export. If its columns have different names, you match them before anything is saved." },
  { title: "See what needs attention", body: "Each invoice gets a priority, a likely reason it is unpaid and a suggested next step." },
  { title: "Review and approve every email", body: "CashPilot drafts a polite reminder. Nothing is sent until you click Approve & Send." },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const d = await getDashboard(getDb(), session.ctx);
  const canWrite = can(session.ctx, "write");
  const today = todayIso();

  if (d.openCount === 0 && d.paidCount === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Dashboard" description={formatDate(today)} />
        <Card>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <EmptyState title="No invoices yet" icon={<InboxIcon className="size-5" />}
                action={canWrite ? (
                  <Link href="/import" className={buttonClass.primary}>
                    <UploadIcon className="size-4" /> Import invoices
                  </Link>
                ) : undefined}
              >
                {canWrite ? "Start by importing a CSV of your open invoices." : "A teammate needs to import invoices first."}
              </EmptyState>
            </div>
            <ol className="space-y-4">
              {GETTING_STARTED.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-ink">{s.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {formatDate(today)} · <span className="num">{d.openCount}</span> outstanding invoice{d.openCount === 1 ? "" : "s"}
          </>
        }
        actions={
          canWrite && (
            <>
              <ActionButton action={analyzeOutstandingAction} pendingText="Analyzing…" variant={d.unanalyzedCount > 0 ? "primary" : "secondary"}>
                {d.unanalyzedCount > 0 ? `Analyze ${d.unanalyzedCount} new invoice${d.unanalyzedCount === 1 ? "" : "s"}` : "Refresh analysis"}
              </ActionButton>
              <Link href="/import" className={buttonClass.secondary}>Import CSV</Link>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Needs attention today" emphasis>
          <span className="num text-2xl" data-testid="metric-attention">{d.needsAttention.length}</span>
        </Metric>
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
                  {formatMoney(t.overdueMinor, t.currency)}{" "}
                  <span className="text-xs font-normal text-slate-500">({t.overdueCount})</span>
                </div>
              ))}
            </div>
          )}
        </Metric>
        <Metric label="Promised to pay"><span className="num">{d.promised.length}</span></Metric>
        <Metric label="Disputed"><span className="num">{d.disputed.length}</span></Metric>
      </div>

      {d.unanalyzedCount > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone="amber" dot>{d.unanalyzedCount} not analyzed</Badge>
          Unanalyzed invoices appear after analyzed ones in the priority order.
        </p>
      )}

      <Card
        title={`Needs attention today (${d.needsAttention.length})`}
        description="Overdue and not yet contacted, a follow-up that is due, or a promised date that has passed."
        flush
      >
        {d.needsAttention.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing needs attention today." icon={<CheckIcon className="size-5" />}>
              Follow-ups that come due will appear here.
            </EmptyState>
          </div>
        ) : (
          <InvoiceTable rows={d.needsAttention} showAttention />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Promised to pay (${d.promised.length})`} flush>
          {d.promised.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No payment promises recorded." icon={<ClockIcon className="size-5" />} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.promised.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{inv.customerName}</p>
                    <Link href={`/invoices/${inv.id}`} className="text-xs font-medium text-brand-700 hover:underline">{inv.invoiceNumber}</Link>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num font-medium text-ink">{formatMoney(inv.amountMinor, inv.currency)}</span>
                    <Badge tone={inv.promiseToPayDate! < today ? "amber" : "green"} dot>
                      {inv.promiseToPayDate! < today ? "Passed " : "By "}{formatDate(inv.promiseToPayDate)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Disputed (${d.disputed.length})`} flush>
          {d.disputed.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No open disputes." icon={<CheckIcon className="size-5" />} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.disputed.map((inv) => (
                <li key={inv.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{inv.customerName}</p>
                      <Link href={`/invoices/${inv.id}`} className="text-xs font-medium text-brand-700 hover:underline">{inv.invoiceNumber}</Link>
                    </div>
                    <span className="num font-medium text-ink">{formatMoney(inv.amountMinor, inv.currency)}</span>
                  </div>
                  {inv.disputeReason && <p className="mt-1.5 line-clamp-2 text-slate-600">{inv.disputeReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="All outstanding invoices by priority" flush>
        {d.priority.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Every invoice is paid." icon={<CheckIcon className="size-5" />} />
          </div>
        ) : (
          <InvoiceTable rows={d.priority} />
        )}
      </Card>

      {!canWrite && (
        <p className="text-sm text-slate-500">
          Your role is read-only. <Link className={linkClass} href="/team">See your team</Link>.
        </p>
      )}
    </div>
  );
}
