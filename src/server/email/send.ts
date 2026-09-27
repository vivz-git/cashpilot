import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { emailMessages, followUps, invoices, users, type FollowUp } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { isValidEmail } from "@/lib/email-address";
import { recordActivity } from "../activities";
import { checkDraftSafety, sanitizeDraft, type SafetyIssue } from "../ai/drafting";
import { draftSafetyFacts } from "../ai/service";
import { audit } from "../audit";
import { requirePermission, type AuthContext } from "../auth/context";
import { AppError, NotFoundError } from "../errors";
import { getInvoice, isUuid } from "../invoices/queries";
import { DEFAULT_FOLLOW_UP_DAYS } from "../invoices/schedule";
import { checkRateLimit, LIMITS } from "../rate-limit";
import { emailFromAddress, EmailSendError, getEmailProvider, type EmailProvider } from "./provider";
import { isStaleSending, releaseStaleSends, STALE_SENDING_MS } from "./recovery";

export const MAX_SEND_ATTEMPTS = 3;
export const MIN_HOURS_BETWEEN_REMINDERS = 24;

const draftInput = z.object({
  subject: z.string().trim().min(1, "Subject is required.").max(200, "Subject is too long."),
  body: z.string().trim().min(1, "Message body is required.").max(5000, "Message is too long."),
});

async function loadFollowUp(db: Pick<Database, "select">, ctx: AuthContext, followUpId: string): Promise<FollowUp> {
  if (!isUuid(followUpId)) throw new NotFoundError("Draft");
  const [row] = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.id, followUpId), eq(followUps.organizationId, ctx.orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Draft");
  return row;
}

/** Save user edits to a draft. Returns safety warnings for the edited text. */
export async function updateDraft(
  db: Database,
  ctx: AuthContext,
  followUpId: string,
  input: unknown,
): Promise<{ followUp: FollowUp; warnings: SafetyIssue[] }> {
  requirePermission(ctx, "write");
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid draft.");
  const existing = await loadFollowUp(db, ctx, followUpId);
  const invoice = await getInvoice(db, ctx, existing.invoiceId);
  const clean = sanitizeDraft(parsed.data);

  if (clean.subject === existing.subject && clean.body === existing.body) {
    return { followUp: existing, warnings: checkDraftSafety(clean, draftSafetyFacts(invoice)) };
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(followUps)
      .set({ subject: clean.subject, body: clean.body, edited: true, updatedAt: new Date() })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.organizationId, ctx.orgId),
          inArray(followUps.status, ["draft", "failed"]),
        ),
      )
      .returning();
    if (!row) throw new AppError("This draft can no longer be edited.", "conflict");
    await recordActivity(tx, {
      orgId: ctx.orgId,
      invoiceId: row.invoiceId,
      actorUserId: ctx.userId,
      type: "reminder_edited",
      summary: `Reminder edited: "${clean.subject}".`,
      metadata: { followUpId },
    });
    return row;
  });
  return { followUp: updated, warnings: checkDraftSafety(clean, draftSafetyFacts(invoice)) };
}

export interface SendOptions {
  provider?: EmailProvider;
  now?: Date;
  /** Injected for tests to avoid real waiting between retries. */
  sleep?: (ms: number) => Promise<void>;
}

export type SendResult =
  | { ok: true; emailId: string; attempts: number }
  | { ok: false; emailId: string | null; attempts: number; error: string };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The only path that sends a collections email. Requires an explicit human
 * "Approve & Send" with the final subject and body as shown to the user.
 */
export async function approveAndSend(
  db: Database,
  ctx: AuthContext,
  followUpId: string,
  finalContent: unknown,
  opts: SendOptions = {},
): Promise<SendResult> {
  requirePermission(ctx, "send_email");
  checkRateLimit(`email:${ctx.orgId}`, LIMITS.email);
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? defaultSleep;

  let draft = await loadFollowUp(db, ctx, followUpId);
  if (isStaleSending(draft, now)) {
    await releaseStaleSends(db, ctx, draft.invoiceId, now);
    draft = await loadFollowUp(db, ctx, followUpId);
  }
  if (draft.status === "sent") throw new AppError("This reminder has already been sent.", "conflict");
  if (draft.status === "sending") throw new AppError("This reminder is already being sent.", "conflict");
  if (draft.status === "discarded") throw new AppError("This draft was replaced by a newer one.", "conflict");

  const invoice = await getInvoice(db, ctx, draft.invoiceId);
  if (invoice.status !== "open") throw new AppError("This invoice is already marked as paid.", "conflict");

  // Apply any last edits shown in the editor, then claim the draft atomically.
  const content = finalContent === undefined ? { subject: draft.subject, body: draft.body } : finalContent;
  const parsed = draftInput.safeParse(content);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid draft.");
  const clean = sanitizeDraft(parsed.data);
  if (clean.subject !== draft.subject || clean.body !== draft.body) {
    await updateDraft(db, ctx, followUpId, clean);
  }

  const [sender] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, ctx.userId), eq(users.organizationId, ctx.orgId)));

  // Serialise sends per invoice: lock the invoice row, enforce the reminder
  // spacing rule, then claim the draft with a conditional update. A second
  // click or concurrent request finds the draft no longer in draft/failed.
  const recipient = invoice.customerEmail;
  const provider = opts.provider ?? getEmailProvider();
  const [message] = await db.transaction(async (tx) => {
    await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoice.id), eq(invoices.organizationId, ctx.orgId)))
      .for("update");
    const recent = await tx
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.organizationId, ctx.orgId),
          eq(emailMessages.invoiceId, invoice.id),
          or(
            and(eq(emailMessages.status, "sending"), gt(emailMessages.createdAt, new Date(now.getTime() - STALE_SENDING_MS))),
            and(
              eq(emailMessages.status, "sent"),
              gt(emailMessages.sentAt, new Date(now.getTime() - MIN_HOURS_BETWEEN_REMINDERS * 3_600_000)),
            ),
          ),
        ),
      )
      .limit(1);
    if (recent.length > 0) {
      throw new AppError(
        `A reminder for this invoice was sent in the last ${MIN_HOURS_BETWEEN_REMINDERS} hours or is being sent now. Wait before sending another.`,
        "conflict",
      );
    }
    const claimed = await tx
      .update(followUps)
      .set({ status: "sending", approvedBy: ctx.userId, approvedAt: now, updatedAt: now })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.organizationId, ctx.orgId),
          inArray(followUps.status, ["draft", "failed"]),
        ),
      )
      .returning();
    if (claimed.length === 0) throw new AppError("This reminder is already being sent.", "conflict");
    return tx
      .insert(emailMessages)
      .values({
        organizationId: ctx.orgId,
        invoiceId: invoice.id,
        followUpId,
        userId: ctx.userId,
        recipient,
        subject: clean.subject,
        body: clean.body,
        status: "sending",
        provider: provider.name,
      })
      .returning({ id: emailMessages.id });
  });
  await audit(db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "email.approved",
    targetType: "email_message",
    targetId: message!.id,
    metadata: { followUpId, invoiceId: invoice.id, recipient },
  });

  let attempts = 0;
  let error: EmailSendError | null = null;
  let messageId: string | null = null;

  if (!isValidEmail(recipient)) {
    error = new EmailSendError("The customer's email address is invalid. Correct it before sending.", true);
  } else {
    while (attempts < MAX_SEND_ATTEMPTS) {
      attempts += 1;
      try {
        ({ messageId } = await provider.send({
          from: emailFromAddress(),
          to: recipient,
          replyTo: sender?.email,
          subject: clean.subject,
          text: clean.body,
        }));
        error = null;
        break;
      } catch (err) {
        error = err instanceof EmailSendError ? err : new EmailSendError("Unexpected error while sending.", false);
        if (error.permanent || attempts >= MAX_SEND_ATTEMPTS) break;
        await sleep(500 * 2 ** (attempts - 1));
      }
    }
  }

  const sentAt = new Date();
  if (!error) {
    await db.transaction(async (tx) => {
      await tx
        .update(emailMessages)
        .set({ status: "sent", attempts, providerMessageId: messageId, sentAt, error: null })
        .where(eq(emailMessages.id, message!.id));
      await tx
        .update(followUps)
        .set({ status: "sent", sentAt, updatedAt: sentAt })
        .where(eq(followUps.id, followUpId));
      const today = todayIso(now);
      const next =
        invoice.promiseToPayDate && invoice.promiseToPayDate >= today
          ? addDays(invoice.promiseToPayDate, 1)
          : addDays(today, DEFAULT_FOLLOW_UP_DAYS);
      await tx
        .update(invoices)
        .set({
          lastContactAt: sentAt,
          followUpCount: sql`${invoices.followUpCount} + 1`,
          nextFollowUpDate: next,
          updatedAt: sentAt,
        })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.organizationId, ctx.orgId)));
      await recordActivity(tx, {
        orgId: ctx.orgId,
        invoiceId: invoice.id,
        actorUserId: ctx.userId,
        type: "reminder_sent",
        summary: `Reminder sent to ${recipient}: "${clean.subject}".`,
        metadata: { emailId: message!.id, followUpId, attempts },
      });
      await audit(tx, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: "email.sent",
        targetType: "email_message",
        targetId: message!.id,
        metadata: { provider: provider.name, attempts, recipient },
      });
    });
    return { ok: true, emailId: message!.id, attempts };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(emailMessages)
      .set({ status: "failed", attempts, error: error!.message })
      .where(eq(emailMessages.id, message!.id));
    await tx.update(followUps).set({ status: "failed", updatedAt: sentAt }).where(eq(followUps.id, followUpId));
    await recordActivity(tx, {
      orgId: ctx.orgId,
      invoiceId: invoice.id,
      actorUserId: ctx.userId,
      type: "reminder_failed",
      summary: `Reminder to ${recipient} failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${error!.message}`,
      metadata: { emailId: message!.id, followUpId, attempts, permanent: error!.permanent },
    });
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "email.failed",
      targetType: "email_message",
      targetId: message!.id,
      metadata: { provider: provider.name, attempts, error: error!.message },
    });
  });
  return { ok: false, emailId: message!.id, attempts, error: error.message };
}
