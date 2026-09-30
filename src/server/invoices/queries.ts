import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { emailMessages, followUps, invoiceAnalyses, invoices, users, type Invoice } from "@/db/schema";
import { daysOverdue, todayIso } from "@/lib/dates";
import { requirePermission, type AuthContext } from "../auth/context";
import { NotFoundError } from "../errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Loads an invoice only if it belongs to the caller's organization. */
export async function getInvoice(db: Pick<Database, "select">, ctx: AuthContext, id: string): Promise<Invoice> {
  requirePermission(ctx, "read");
  if (!isUuid(id)) throw new NotFoundError("Invoice");
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice");
  return row;
}

export type AttentionReason = "follow_up_due" | "never_contacted" | "promise_broken";

export interface InvoiceRow extends Invoice {
  daysOverdue: number;
  attention: AttentionReason | null;
  /** Something was recorded (reply, promise, dispute, send…) after the last AI analysis. */
  analysisOutdated: boolean;
}

/** Why an invoice needs attention today (DECISIONS.md D52), or null. */
export function attentionReason(inv: Invoice, now: Date = new Date()): AttentionReason | null {
  if (inv.status !== "open" || inv.disputeStatus === "open") return null;
  const today = todayIso(now);
  if (inv.promiseToPayDate) {
    return inv.promiseToPayDate < today ? "promise_broken" : null;
  }
  if (inv.nextFollowUpDate) return inv.nextFollowUpDate <= today ? "follow_up_due" : null;
  if (inv.dueDate < today && !inv.lastContactAt) return "never_contacted";
  return null;
}

function toRow(inv: Invoice, now: Date): InvoiceRow {
  return {
    ...inv,
    daysOverdue: daysOverdue(inv.dueDate, now),
    attention: attentionReason(inv, now),
    // Every change that affects the recommendation updates `updated_at`; analysis sets both together.
    analysisOutdated: inv.aiAnalyzedAt !== null && inv.updatedAt.getTime() > inv.aiAnalyzedAt.getTime(),
  };
}

/** Highest AI priority first; unanalysed invoices after analysed ones; then most overdue. */
export function byPriority(a: InvoiceRow, b: InvoiceRow): number {
  const pa = a.aiPriority ?? 0;
  const pb = b.aiPriority ?? 0;
  if (pa !== pb) return pb - pa;
  if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
  return b.amountMinor - a.amountMinor;
}

export interface CurrencyTotal {
  currency: string;
  outstandingMinor: number;
  overdueMinor: number;
  openCount: number;
  overdueCount: number;
}

export interface Dashboard {
  totals: CurrencyTotal[];
  openCount: number;
  unanalyzedCount: number;
  needsAttention: InvoiceRow[];
  priority: InvoiceRow[];
  promised: InvoiceRow[];
  disputed: InvoiceRow[];
  paidCount: number;
}

export async function getDashboard(db: Database, ctx: AuthContext, now: Date = new Date()): Promise<Dashboard> {
  requirePermission(ctx, "read");
  const all = await db.select().from(invoices).where(eq(invoices.organizationId, ctx.orgId));
  const open = all.filter((i) => i.status === "open").map((i) => toRow(i, now));

  const totalsMap = new Map<string, CurrencyTotal>();
  for (const inv of open) {
    const t =
      totalsMap.get(inv.currency) ??
      { currency: inv.currency, outstandingMinor: 0, overdueMinor: 0, openCount: 0, overdueCount: 0 };
    t.outstandingMinor += inv.amountMinor;
    t.openCount += 1;
    if (inv.daysOverdue > 0) {
      t.overdueMinor += inv.amountMinor;
      t.overdueCount += 1;
    }
    totalsMap.set(inv.currency, t);
  }

  const sorted = [...open].sort(byPriority);
  return {
    totals: [...totalsMap.values()].sort((a, b) => b.outstandingMinor - a.outstandingMinor),
    openCount: open.length,
    unanalyzedCount: open.filter((i) => i.aiAnalyzedAt === null).length,
    needsAttention: sorted.filter((i) => i.attention !== null),
    priority: sorted,
    promised: open
      .filter((i) => i.promiseToPayDate && i.disputeStatus !== "open")
      .sort((a, b) => (a.promiseToPayDate! < b.promiseToPayDate! ? -1 : 1)),
    disputed: open.filter((i) => i.disputeStatus === "open").sort(byPriority),
    paidCount: all.length - open.length,
  };
}

export async function getInvoiceDetail(db: Database, ctx: AuthContext, id: string, now: Date = new Date()) {
  const invoice = await getInvoice(db, ctx, id);
  const [latestAnalysis] = await db
    .select()
    .from(invoiceAnalyses)
    .where(and(eq(invoiceAnalyses.organizationId, ctx.orgId), eq(invoiceAnalyses.invoiceId, id)))
    .orderBy(desc(invoiceAnalyses.createdAt))
    .limit(1);
  const drafts = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.organizationId, ctx.orgId), eq(followUps.invoiceId, id)))
    .orderBy(desc(followUps.createdAt));
  const emails = await db
    .select({
      id: emailMessages.id,
      recipient: emailMessages.recipient,
      subject: emailMessages.subject,
      body: emailMessages.body,
      status: emailMessages.status,
      provider: emailMessages.provider,
      attempts: emailMessages.attempts,
      error: emailMessages.error,
      sentAt: emailMessages.sentAt,
      createdAt: emailMessages.createdAt,
      followUpId: emailMessages.followUpId,
      senderName: users.name,
    })
    .from(emailMessages)
    .leftJoin(users, eq(users.id, emailMessages.userId))
    .where(and(eq(emailMessages.organizationId, ctx.orgId), eq(emailMessages.invoiceId, id)))
    .orderBy(desc(emailMessages.createdAt));
  return {
    invoice: toRow(invoice, now),
    latestAnalysis: latestAnalysis ?? null,
    activeDraft: drafts.find((d) => d.status === "draft" || d.status === "failed" || d.status === "sending") ?? null,
    emails,
  };
}
