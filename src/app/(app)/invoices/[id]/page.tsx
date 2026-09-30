import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { analyzeInvoiceAction, generateDraftAction } from "@/app/actions/invoices";
import { ActionButton } from "@/components/action-button";
import { ArrowLeftIcon, CheckIcon, MailIcon } from "@/components/icons";
import { OverdueCell, SituationBadge } from "@/components/invoice-table";
import { Alert, Badge, Card, EmptyState, Eyebrow, PriorityBadge } from "@/components/ui";
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
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

type StepState = "done" | "current" | "todo";

/** Where this invoice is in the analyze → draft → approve & send → record outcome loop. */
function WorkflowSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Follow-up steps">
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.state === "current" ? "step" : undefined}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            s.state === "current"
              ? "border-brand-200 bg-brand-50 font-medium text-brand-800"
              : s.state === "done"
                ? "border-slate-200/80 bg-white text-slate-600"
                : "border-dashed border-slate-200 text-slate-400"
          }`}
        >
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold ${
              s.state === "done" ? "bg-emerald-600 text-white" : s.state === "current" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {s.state === "done" ? <CheckIcon className="size-3" strokeWidth={2.5} /> : i + 1}
          </span>
          <span className="truncate">{s.label}</span>
          {s.state === "done" && <span className="sr-only">(done)</span>}
        </li>
      ))}
    </ol>
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
  const disputed = invoice.disputeStatus === "open";
  const latestActivityAt = timeline.find((t) => t.type !== "ai_analyzed" && t.type !== "reminder_drafted" && t.type !== "reminder_edited")?.createdAt;
  const stale = a && latestActivityAt && latestActivityAt > a.createdAt;
  const escalate = a && isOpen && needsHumanReview({ customerSituation: a.customerSituation, followUpCount: invoice.followUpCount });
  const sentCount = emails.filter((e) => e.status === "sent").length;

  const done = {
    analyze: Boolean(a),
    draft: Boolean(activeDraft) || emails.length > 0,
    send: sentCount > 0,
    outcome: timeline.some((t) => t.source === "manual"),
  };
  const order = ["analyze", "draft", "send", "outcome"] as const;
  const current = isOpen ? order.find((k) => !done[k]) : undefined;
  const steps = [
    { key: "analyze", label: "Analyze" },
    { key: "draft", label: "Review draft" },
    { key: "send", label: "Approve & send" },
    { key: "outcome", label: "Record outcome" },
  ].map((s) => ({
    label: s.label,
    state: (done[s.key as (typeof order)[number]] ? "done" : s.key === current ? "current" : "todo") as StepState,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded text-sm text-slate-500 hover:text-ink">
          <ArrowLeftIcon className="size-3.5" /> Dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Invoice {invoice.invoiceNumber}</h1>
              {isOpen ? <Badge tone="blue" dot>Open</Badge> : <Badge tone="green" dot>Paid</Badge>}
              {disputed && <Badge tone="red" dot>Disputed</Badge>}
              {invoice.disputeStatus === "resolved" && <Badge>Dispute resolved</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {invoice.customerName} · due {formatDate(invoice.dueDate)}
              {isOpen && invoice.daysOverdue > 0 && <> · <OverdueCell days={invoice.daysOverdue} /> overdue</>}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <Eyebrow>{isOpen ? "Amount owed" : "Amount"}</Eyebrow>
            <p className="num text-3xl font-semibold tracking-tight text-ink">{formatMoney(invoice.amountMinor, invoice.currency)}</p>
          </div>
        </div>
      </div>

      {isOpen && <WorkflowSteps steps={steps} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="AI analysis"
            description="Why this invoice may be unpaid and what to do next."
            actions={
              canWrite && isOpen ? (
                <ActionButton action={analyzeInvoiceAction.bind(null, invoice.id)} pendingText="Analyzing…" variant={a ? "secondary" : "primary"}>
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
              <div className="space-y-5 text-sm" data-testid="analysis">
                {(escalate || (stale && isOpen)) && (
                  <div className="space-y-2">
                    {escalate && (
                      <Alert tone="warning">
                        Needs human judgement: {a.customerSituation === "dispute" ? "the customer has disputed this invoice." : a.customerSituation === "cash_flow_issue" ? "the customer may have cash-flow difficulties." : "the reason for non-payment is still unknown after contacting the customer."}
                      </Alert>
                    )}
                    {stale && isOpen && <Alert tone="info">New activity since this analysis. Re-analyze for an up-to-date recommendation.</Alert>}
                  </div>
                )}

                <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-4">
                  <Eyebrow>Recommended next step</Eyebrow>
                  <p className="mt-1 text-[0.9375rem] font-medium leading-snug text-ink">{a.recommendedAction}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PriorityBadge score={a.priorityScore} showLevel />
                    <SituationBadge situation={a.customerSituation} />
                    <Badge tone={a.confidence === "high" ? "green" : a.confidence === "medium" ? "blue" : "amber"}>{a.confidence} confidence</Badge>
                    <Badge>Tone: {a.recommendedTone}</Badge>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Eyebrow>Reason</Eyebrow>
                    <p className="mt-1 text-slate-800">{a.reason}</p>
                  </div>
                  {a.missingInformation.length > 0 && (
                    <div>
                      <Eyebrow>Missing information</Eyebrow>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                        {a.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {a.evidence.length > 0 && (
                  <div>
                    <Eyebrow>Evidence from notes and activity</Eyebrow>
                    <ul className="mt-1.5 space-y-1.5">
                      {a.evidence.map((e, i) => <li key={i} className="border-l-2 border-brand-200 pl-3 text-slate-700">“{e}”</li>)}
                    </ul>
                  </div>
                )}

                <details className="group border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <summary className="cursor-pointer select-none hover:text-slate-700">
                    Source: {a.source === "fallback" ? "rule-based fallback" : a.provider === "mock" ? "rule-based (offline mode)" : `${a.provider}${a.model ? ` · ${a.model}` : ""}`} · {formatDateTime(a.createdAt)}
                    {a.guardNotes.length > 0 && ` · ${a.guardNotes.length} safety check${a.guardNotes.length === 1 ? "" : "s"} applied`}
                  </summary>
                  {a.guardNotes.length > 0 ? (
                    <ul className="mt-1.5 list-disc pl-5">{a.guardNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                  ) : (
                    <p className="mt-1.5">The AI output passed all checks unchanged.</p>
                  )}
                </details>
              </div>
            )}
          </Card>

          <Card
            title="Follow-up email"
            description={isOpen ? "Review and edit the draft. Nothing is sent until you approve it." : undefined}
            actions={
              canWrite && isOpen && !(activeDraft?.status === "sending" && !isStaleSending(activeDraft)) ? (
                <ActionButton action={generateDraftAction.bind(null, invoice.id)} pendingText="Drafting…" variant={activeDraft ? "secondary" : "primary"}>
                  {activeDraft ? "Redraft" : "Draft follow-up"}
                </ActionButton>
              ) : undefined
            }
          >
            {!isOpen ? (
              <EmptyState title="This invoice is paid. No follow-up needed." icon={<CheckIcon className="size-5" />} />
            ) : !activeDraft ? (
              <EmptyState title="No draft." icon={<MailIcon className="size-5" />}>
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
                disputed={disputed}
                testMode={getRuntimeModes().email !== "smtp"}
              />
            )}
          </Card>

          <Card title={`Emails sent (${sentCount})`} flush>
            {emails.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No emails sent for this invoice yet." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {emails.map((e) => (
                  <li key={e.id} className="px-5 py-4 text-sm" data-testid="sent-email">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-ink">{e.subject}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "blue"} dot>{e.status}</Badge>
                        {e.provider === "mock" && e.status === "sent" && (
                          <Badge tone="amber" title="Sent in test mode: recorded in CashPilot, not delivered to the customer">test mode · not delivered</Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      To {e.recipient} · by {e.senderName ?? "former user"} · {formatDateTime(e.sentAt ?? e.createdAt)} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                    </p>
                    {e.error && <p className="mt-1 text-xs text-red-700">{e.error}</p>}
                    <details className="mt-2">
                      <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-slate-700">Show message</summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-slate-700">{e.body}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Details">
            <dl className="-my-2 divide-y divide-slate-100">
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
              <div className="mt-4 rounded-lg border border-red-200/80 bg-red-50/60 p-3 text-sm text-red-900">
                <span className="font-medium">Dispute reason:</span> {invoice.disputeReason}
              </div>
            )}
            {invoice.notes && (
              <div className="mt-4">
                <Eyebrow>Notes</Eyebrow>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p>
              </div>
            )}
          </Card>

          {canWrite && (
            <Card title="Record outcome" description="Log what the customer said or did.">
              <OutcomeForm invoiceId={invoice.id} isOpen={isOpen} disputeOpen={disputed} />
            </Card>
          )}

          <Card title="Timeline">
            {timeline.length === 0 ? (
              <EmptyState title="No activity yet." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-slate-200" data-testid="timeline">
                {timeline.map((t) => (
                  <li key={t.id} className="relative pl-6 text-sm">
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-white ring-1 ${
                        t.source === "manual" ? "bg-brand-600 ring-brand-200" : "bg-slate-300 ring-slate-200"
                      }`}
                    />
                    <p className="font-medium text-ink">{ACTIVITY_LABELS[t.type] ?? t.type}</p>
                    <p className="whitespace-pre-wrap break-words text-slate-700">{t.summary}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(t.createdAt)}{t.actorName ? ` · ${t.actorName}` : ""}{t.source === "manual" ? " · recorded manually" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
