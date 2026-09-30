import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { analyzeInvoiceAction, generateDraftAction } from "@/app/actions/invoices";
import { ActionButton } from "@/components/action-button";
import { OverdueCell, SituationBadge } from "@/components/invoice-table";
import { Alert, Badge, Card, EmptyState, PriorityBadge } from "@/components/ui";
import { getDb } from "@/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { listTimeline } from "@/server/activities";
import { needsHumanReview } from "@/server/ai/guard";
import { INTERRUPTED_MESSAGE, isStaleSending } from "@/server/email/recovery";
import { can } from "@/server/auth/context";
import { requireSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getInvoiceDetail } from "@/server/invoices/queries";
import { getRuntimeModes } from "@/server/runtime-mode";
import { DraftEditor } from "./draft-editor";
import { OutcomeForm } from "./outcome-form";

export const metadata: Metadata = { title: "Invoice" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{children}</dd>
    </div>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();
  let detail;
  try {
    detail = await getInvoiceDetail(db, session.ctx, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const timeline = await listTimeline(db, session.ctx, id);
  const { invoice, latestAnalysis: a, activeDraft, emails } = detail;
  const canWrite = can(session.ctx, "write");
  const canSend = can(session.ctx, "send_email");
  const isOpen = invoice.status === "open";
  const latestActivityAt = timeline.find((t) => t.type !== "ai_analyzed" && t.type !== "reminder_drafted" && t.type !== "reminder_edited")?.createdAt;
  const stale = a && latestActivityAt && latestActivityAt > a.createdAt;
  const escalate = a && isOpen && needsHumanReview({ customerSituation: a.customerSituation, followUpCount: invoice.followUpCount });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">← Dashboard</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Invoice {invoice.invoiceNumber}</h1>
          {isOpen ? <Badge tone="blue">Open</Badge> : <Badge tone="green">Paid</Badge>}
          {invoice.disputeStatus === "open" && <Badge tone="red">Disputed</Badge>}
          {invoice.disputeStatus === "resolved" && <Badge>Dispute resolved</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {invoice.customerName} · <span className="num font-medium text-slate-900">{formatMoney(invoice.amountMinor, invoice.currency)}</span> · due {formatDate(invoice.dueDate)}
          {isOpen && invoice.daysOverdue > 0 && <> · <OverdueCell days={invoice.daysOverdue} /> overdue</>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="AI analysis"
            actions={
              canWrite && isOpen ? (
                <ActionButton action={analyzeInvoiceAction.bind(null, invoice.id)} pendingText="Analyzing…">
                  {a ? "Re-analyze" : "Analyze"}
                </ActionButton>
              ) : undefined
            }
          >
            {!a ? (
              <EmptyState title="Not analyzed yet.">
                {isOpen ? "Run an analysis to get a priority and a recommended next step." : "Paid invoices are not analyzed."}
              </EmptyState>
            ) : (
              <div className="space-y-4 text-sm" data-testid="analysis">
                {escalate && (
                  <Alert tone="warning">
                    Needs human judgement: {a.customerSituation === "dispute" ? "the customer has disputed this invoice." : a.customerSituation === "cash_flow_issue" ? "the customer may have cash-flow difficulties." : "the reason for non-payment is still unknown after contacting the customer."}
                  </Alert>
                )}
                {stale && isOpen && <Alert tone="info">New activity since this analysis. Re-analyze for an up-to-date recommendation.</Alert>}
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge score={a.priorityScore} />
                  <SituationBadge situation={a.customerSituation} />
                  <Badge tone={a.confidence === "high" ? "green" : a.confidence === "medium" ? "blue" : "amber"}>{a.confidence} confidence</Badge>
                  <Badge>Tone: {a.recommendedTone}</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Reason</p>
                  <p className="mt-0.5 text-slate-800">{a.reason}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommended action</p>
                  <p className="mt-0.5 font-medium text-slate-900">{a.recommendedAction}</p>
                </div>
                {a.missingInformation.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Missing information</p>
                    <ul className="mt-0.5 list-disc pl-5 text-slate-700">
                      {a.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {a.evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence from notes and activity</p>
                    <ul className="mt-0.5 space-y-1">
                      {a.evidence.map((e, i) => <li key={i} className="border-l-2 border-slate-300 pl-2 text-slate-700">“{e}”</li>)}
                    </ul>
                  </div>
                )}
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer select-none">
                    Source: {a.source === "fallback" ? "rule-based fallback" : a.provider === "mock" ? "rule-based (offline mode)" : `${a.provider}${a.model ? ` · ${a.model}` : ""}`} · {formatDateTime(a.createdAt)}
                    {a.guardNotes.length > 0 && ` · ${a.guardNotes.length} safety check${a.guardNotes.length === 1 ? "" : "s"} applied`}
                  </summary>
                  {a.guardNotes.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5">{a.guardNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                  ) : (
                    <p className="mt-1">The AI output passed all checks unchanged.</p>
                  )}
                </details>
              </div>
            )}
          </Card>

          <Card
            title="Follow-up email"
            actions={
              canWrite && isOpen && !(activeDraft?.status === "sending" && !isStaleSending(activeDraft)) ? (
                <ActionButton action={generateDraftAction.bind(null, invoice.id)} pendingText="Drafting…" variant={activeDraft ? "secondary" : "primary"}>
                  {activeDraft ? "Redraft" : "Draft follow-up"}
                </ActionButton>
              ) : undefined
            }
          >
            {!isOpen ? (
              <EmptyState title="This invoice is paid. No follow-up needed." />
            ) : !activeDraft ? (
              <EmptyState title="No draft.">
                {canWrite ? "Draft a follow-up. Nothing is sent until you review it and click Approve & Send." : "Your role is read-only."}
              </EmptyState>
            ) : activeDraft.status === "sending" && !isStaleSending(activeDraft) ? (
              <Alert tone="info">This email is being sent. Refresh in a moment to see the delivery status.</Alert>
            ) : (
              <DraftEditor
                key={activeDraft.id}
                invoiceId={invoice.id}
                followUpId={activeDraft.id}
                subject={activeDraft.subject}
                body={activeDraft.body}
                source={activeDraft.source}
                failed={activeDraft.status !== "draft"}
                lastError={
                  activeDraft.status === "sending"
                    ? INTERRUPTED_MESSAGE
                    : (emails.find((e) => e.followUpId === activeDraft.id && e.status === "failed")?.error ?? null)
                }
                recipient={invoice.customerEmail}
                invoiceNumber={invoice.invoiceNumber}
                amount={formatMoney(invoice.amountMinor, invoice.currency)}
                canEdit={canWrite}
                canSend={canSend}
                disputed={invoice.disputeStatus === "open"}
                testMode={getRuntimeModes().email !== "smtp"}
              />
            )}
          </Card>

          <Card title={`Emails sent (${emails.filter((e) => e.status === "sent").length})`}>
            {emails.length === 0 ? (
              <EmptyState title="No emails sent for this invoice yet." />
            ) : (
              <ul className="space-y-3">
                {emails.map((e) => (
                  <li key={e.id} className="rounded-md border border-slate-200 p-3 text-sm" data-testid="sent-email">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{e.subject}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "blue"}>{e.status}</Badge>
                        {e.provider === "mock" && e.status === "sent" && (
                          <Badge tone="amber" title="Sent in test mode: recorded in CashPilot, not delivered to the customer">test mode · not delivered</Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      To {e.recipient} · by {e.senderName ?? "former user"} · {formatDateTime(e.sentAt ?? e.createdAt)} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                    </p>
                    {e.error && <p className="mt-1 text-xs text-red-700">{e.error}</p>}
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none text-xs text-slate-500">Show message</summary>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700">{e.body}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="divide-y divide-slate-100">
              <Field label="Customer">{invoice.customerName}</Field>
              <Field label="Email"><span className="break-all">{invoice.customerEmail}</span></Field>
              <Field label="Invoice date">{formatDate(invoice.invoiceDate)}</Field>
              <Field label="Due date">{formatDate(invoice.dueDate)}</Field>
              <Field label="Days overdue"><span className="num">{invoice.daysOverdue}</span></Field>
              <Field label="Account manager">{invoice.accountManager ?? "—"}</Field>
              <Field label="Last contact">{formatDateTime(invoice.lastContactAt)}</Field>
              <Field label="Next follow-up">{formatDate(invoice.nextFollowUpDate)}</Field>
              <Field label="Follow-ups sent"><span className="num">{invoice.followUpCount}</span></Field>
              <Field label="Promise to pay">{formatDate(invoice.promiseToPayDate)}</Field>
              <Field label="Dispute">{invoice.disputeStatus === "none" ? "None" : invoice.disputeStatus === "open" ? "Open" : "Resolved"}</Field>
              {invoice.paidAt && <Field label="Paid">{formatDateTime(invoice.paidAt)}</Field>}
            </dl>
            {invoice.disputeReason && (
              <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Dispute reason:</span> {invoice.disputeReason}</p>
            )}
            {invoice.notes && (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p>
              </div>
            )}
          </Card>

          {canWrite && (
            <Card title="Record outcome">
              <OutcomeForm invoiceId={invoice.id} isOpen={isOpen} disputeOpen={invoice.disputeStatus === "open"} />
            </Card>
          )}

          <Card title="Timeline">
            {timeline.length === 0 ? (
              <EmptyState title="No activity yet." />
            ) : (
              <ol className="space-y-3" data-testid="timeline">
                {timeline.map((t) => (
                  <li key={t.id} className="relative border-l-2 border-slate-200 pl-3 text-sm">
                    <p className="font-medium text-slate-900">{ACTIVITY_LABELS[t.type] ?? t.type}</p>
                    <p className="whitespace-pre-wrap break-words text-slate-700">{t.summary}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(t.createdAt)}{t.actorName ? ` · ${t.actorName}` : ""}{t.source === "manual" ? " · recorded manually" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
