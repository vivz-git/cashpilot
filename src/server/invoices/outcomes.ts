import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { followUps, invoices, type ActivityType } from "@/db/schema";
import { addDays, formatDate, isValidIsoDate, todayIso } from "@/lib/dates";
import { recordActivity } from "../activities";
import { audit } from "../audit";
import { requirePermission, type AuthContext } from "../auth/context";
import { AppError } from "../errors";
import { DEFAULT_FOLLOW_UP_DAYS } from "./schedule";
import { getInvoice } from "./queries";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const note = (required: boolean, label = "Note") => {
  const base = z.string().transform((v) => v.replace(CONTROL, "").trim());
  return required
    ? base.pipe(z.string().min(1, `${label} is required.`).max(2000, `${label} is too long.`))
    : base.pipe(z.string().max(2000, `${label} is too long.`)).optional();
};
const isoDate = (label: string) =>
  z.string().trim().refine(isValidIsoDate, `${label} must be a valid date (YYYY-MM-DD).`);

/**
 * Outcomes a user records by hand. The same shapes can later be produced by
 * automatic reply ingestion (`source = "email_inbound"`).
 */
export const outcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("customer_replied"), note: note(true, "Reply summary") }),
  z.object({ type: z.literal("promised_payment"), promisedDate: isoDate("Promised date"), note: note(false) }),
  z.object({ type: z.literal("dispute"), note: note(true, "Dispute reason") }),
  z.object({ type: z.literal("dispute_resolved"), note: note(false) }),
  z.object({ type: z.literal("paid"), note: note(false) }),
  z.object({ type: z.literal("no_response"), note: note(false) }),
  z.object({ type: z.literal("note"), note: note(true) }),
]);
export type OutcomeInput = z.infer<typeof outcomeSchema>;

export async function recordOutcome(
  db: Database,
  ctx: AuthContext,
  invoiceId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<void> {
  requirePermission(ctx, "write");
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input.");
  const o = parsed.data;
  const invoice = await getInvoice(db, ctx, invoiceId);
  const today = todayIso(now);
  const text = o.note ? ` ${o.note}` : "";

  if (invoice.status === "paid" && o.type !== "note") {
    throw new AppError("This invoice is already marked as paid.", "conflict");
  }

  let update: Partial<typeof invoices.$inferInsert> = {};
  let type: ActivityType;
  let summary: string;

  switch (o.type) {
    case "customer_replied":
      type = "customer_replied";
      summary = `Customer replied:${text}`;
      update = { lastContactAt: now, nextFollowUpDate: addDays(today, DEFAULT_FOLLOW_UP_DAYS) };
      break;
    case "promised_payment": {
      if (o.promisedDate < invoice.invoiceDate) throw new AppError("Promised date is before the invoice date.");
      if (o.promisedDate > addDays(today, 366)) throw new AppError("Promised date is more than a year away.");
      type = "payment_promised";
      summary = `Customer promised payment by ${formatDate(o.promisedDate)}.${text}`;
      update = { lastContactAt: now, promiseToPayDate: o.promisedDate, nextFollowUpDate: addDays(o.promisedDate, 1) };
      break;
    }
    case "dispute":
      if (invoice.disputeStatus === "open") throw new AppError("This invoice already has an open dispute.", "conflict");
      type = "dispute_created";
      summary = `Dispute opened:${text}`;
      update = { disputeStatus: "open", disputeReason: o.note, lastContactAt: now, nextFollowUpDate: null };
      break;
    case "dispute_resolved":
      if (invoice.disputeStatus !== "open") throw new AppError("This invoice has no open dispute.", "conflict");
      type = "dispute_resolved";
      summary = `Dispute resolved.${text}`;
      update = { disputeStatus: "resolved", nextFollowUpDate: today };
      break;
    case "paid":
      type = "payment_received";
      summary = `Payment marked as received.${text}`;
      update = { status: "paid", paidAt: now, nextFollowUpDate: null };
      break;
    case "no_response":
      type = "no_response";
      summary = `No response from customer.${text}`;
      update = { nextFollowUpDate: today };
      break;
    case "note":
      type = "note_added";
      summary = `Note:${text}`;
      break;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(update).length > 0) {
      await tx
        .update(invoices)
        .set({ ...update, updatedAt: now })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.organizationId, ctx.orgId)));
    }
    if (o.type === "paid") {
      // No reminders for a paid invoice.
      await tx
        .update(followUps)
        .set({ status: "discarded", updatedAt: now })
        .where(
          and(
            eq(followUps.organizationId, ctx.orgId),
            eq(followUps.invoiceId, invoice.id),
            inArray(followUps.status, ["draft", "failed"]),
          ),
        );
    }
    await recordActivity(tx, {
      orgId: ctx.orgId,
      invoiceId: invoice.id,
      actorUserId: ctx.userId,
      type,
      source: "manual",
      summary: summary.slice(0, 2100),
      metadata: o.type === "promised_payment" ? { promisedDate: o.promisedDate } : {},
    });
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: `invoice.outcome.${o.type}`,
      targetType: "invoice",
      targetId: invoice.id,
    });
  });
}
