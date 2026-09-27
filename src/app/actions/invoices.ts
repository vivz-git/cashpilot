"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { analyzeInvoice, analyzeOutstanding, generateDraft } from "@/server/ai/service";
import { getSession } from "@/server/auth/session";
import { approveAndSend, updateDraft } from "@/server/email/send";
import { AppError, toUserMessage } from "@/server/errors";
import { recordOutcome } from "@/server/invoices/outcomes";

export type ActionResult = { error?: string; success?: string; warnings?: string[] } | undefined;

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

async function requireCtx() {
  const session = await getSession();
  if (!session) throw new AppError(SESSION_EXPIRED, "unauthenticated");
  return session.ctx;
}

function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

export async function analyzeInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    const analysis = await analyzeInvoice(getDb(), ctx, invoiceId);
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");
    return {
      success:
        analysis.source === "fallback"
          ? "AI provider unavailable. A rule-based analysis was saved instead."
          : "Analysis updated.",
    };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}

export async function analyzeOutstandingAction(): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    const r = await analyzeOutstanding(getDb(), ctx);
    revalidatePath("/dashboard");
    const parts = [`Analyzed ${r.analyzed} invoice${r.analyzed === 1 ? "" : "s"}.`];
    if (r.failed) parts.push(`${r.failed} failed.`);
    if (r.remaining) parts.push(`${r.remaining} remaining — run again to continue.`);
    return { success: parts.join(" ") };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}

export async function generateDraftAction(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    const { warnings } = await generateDraft(getDb(), ctx, invoiceId);
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: "Draft ready for review.", warnings: warnings.map((w) => w.message) };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}

export async function saveDraftAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    const { followUp, warnings } = await updateDraft(getDb(), ctx, str(form, "followUpId"), {
      subject: str(form, "subject"),
      body: str(form, "body"),
    });
    revalidatePath(`/invoices/${followUp.invoiceId}`);
    return { success: "Draft saved.", warnings: warnings.map((w) => w.message) };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}

export async function approveAndSendAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const invoiceId = str(form, "invoiceId");
  try {
    const ctx = await requireCtx();
    const result = await approveAndSend(getDb(), ctx, str(form, "followUpId"), {
      subject: str(form, "subject"),
      body: str(form, "body"),
    });
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");
    return result.ok
      ? { success: "Email sent." }
      : { error: `Email not sent: ${result.error} You can retry from this page.` };
  } catch (err) {
    revalidatePath(`/invoices/${invoiceId}`);
    return { error: toUserMessage(err) };
  }
}

export async function recordOutcomeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const invoiceId = str(form, "invoiceId");
  try {
    const ctx = await requireCtx();
    const type = str(form, "type");
    const input: Record<string, string> = { type, note: str(form, "note") };
    if (type === "promised_payment") input.promisedDate = str(form, "promisedDate");
    await recordOutcome(getDb(), ctx, invoiceId, input);
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");
    return { success: "Recorded." };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}
