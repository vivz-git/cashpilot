import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db";
import {
  activities,
  followUps,
  invoiceAnalyses,
  invoices,
  organizations,
  users,
  type FollowUp,
  type Invoice,
  type InvoiceAnalysis,
} from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { recordActivity } from "../activities";
import { audit } from "../audit";
import { requirePermission, type AuthContext } from "../auth/context";
import { AppError } from "../errors";
import { getInvoice } from "../invoices/queries";
import { checkRateLimit, LIMITS } from "../rate-limit";
import { buildAnalysisContext, type AnalysisContext } from "./context";
import { checkDraftSafety, sanitizeDraft, templateDraft, type DraftContext, type SafetyIssue } from "./drafting";
import { applyAnalysisGuards } from "./guard";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, buildDraftUserPrompt, DRAFT_SYSTEM_PROMPT } from "./prompts";
import { getAiProvider } from "./provider";
import { ruleBasedAnalysis } from "./rules";
import { analysisOutputSchema, draftOutputSchema, type AiProvider, type AiRequest } from "./types";

const ATTEMPTS = 2;

export interface AiOptions {
  provider?: AiProvider;
  now?: Date;
}

/** Parse model text as JSON, tolerating a surrounding markdown code fence. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function callWithValidation<T>(
  provider: AiProvider,
  request: AiRequest,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const parsed = schema.safeParse(parseModelJson(await provider.complete(request)));
      if (parsed.success) return { data: parsed.data, error: null };
      lastError = "the response did not match the expected format";
    } catch (err) {
      lastError = err instanceof SyntaxError ? "the response was not valid JSON" : (err as Error).message;
    }
  }
  return { data: null, error: lastError };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

async function loadContext(db: Database, ctx: AuthContext, invoice: Invoice, now: Date): Promise<AnalysisContext> {
  const acts = await db
    .select({ type: activities.type, summary: activities.summary, createdAt: activities.createdAt })
    .from(activities)
    .where(and(eq(activities.organizationId, ctx.orgId), eq(activities.invoiceId, invoice.id)));
  const peers = await db
    .select({ amountMinor: invoices.amountMinor })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.orgId),
        eq(invoices.status, "open"),
        eq(invoices.currency, invoice.currency),
      ),
    );
  return buildAnalysisContext(invoice, acts, peers.length >= 3 ? median(peers.map((p) => p.amountMinor)) : null, now);
}

export async function analyzeInvoice(
  db: Database,
  ctx: AuthContext,
  invoiceId: string,
  opts: AiOptions = {},
): Promise<InvoiceAnalysis> {
  requirePermission(ctx, "write");
  checkRateLimit(`ai:${ctx.orgId}`, LIMITS.ai);
  const now = opts.now ?? new Date();
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (invoice.status !== "open") throw new AppError("This invoice is paid. Only outstanding invoices are analyzed.");

  const provider = opts.provider ?? getAiProvider();
  const context = await loadContext(db, ctx, invoice, now);
  const result = await callWithValidation(
    provider,
    { task: "analysis", system: ANALYSIS_SYSTEM_PROMPT, user: buildAnalysisUserPrompt(context), context },
    analysisOutputSchema,
  );

  const source = result.data ? "ai" : "fallback";
  const raw = result.data ?? ruleBasedAnalysis(context);
  const { output, notes } = applyAnalysisGuards(raw, context);
  if (!result.data) notes.unshift(`AI provider unavailable (${result.error}); used rule-based analysis.`);

  return db.transaction(async (tx) => {
    const [analysis] = await tx
      .insert(invoiceAnalyses)
      .values({
        organizationId: ctx.orgId,
        invoiceId: invoice.id,
        priorityScore: output.priority_score,
        reason: output.reason,
        customerSituation: output.customer_situation,
        recommendedAction: output.recommended_action,
        recommendedTone: output.recommended_tone,
        confidence: output.confidence,
        missingInformation: output.missing_information,
        evidence: output.evidence,
        guardNotes: notes,
        source,
        provider: provider.name,
        model: provider.model,
        createdBy: ctx.userId,
      })
      .returning();
    await tx
      .update(invoices)
      .set({
        aiPriority: output.priority_score,
        aiReason: output.reason,
        aiRecommendedAction: output.recommended_action,
        aiSituation: output.customer_situation,
        aiConfidence: output.confidence,
        aiAnalyzedAt: now,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.organizationId, ctx.orgId)));
    await recordActivity(tx, {
      orgId: ctx.orgId,
      invoiceId: invoice.id,
      actorUserId: ctx.userId,
      type: "ai_analyzed",
      summary: `Analyzed: priority ${output.priority_score}/10, situation "${output.customer_situation}", ${output.confidence} confidence${source === "fallback" ? " (rule-based fallback)" : ""}.`,
      metadata: { analysisId: analysis!.id, source, provider: provider.name },
    });
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "ai.invoice_analyzed",
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { provider: provider.name, model: provider.model, source, guardNotes: notes.length },
    });
    return analysis!;
  });
}

export const BULK_ANALYSIS_LIMIT = 25;

/** Analyze outstanding invoices that have never been analyzed or were analyzed more than a day ago. */
export async function analyzeOutstanding(
  db: Database,
  ctx: AuthContext,
  opts: AiOptions = {},
): Promise<{ analyzed: number; remaining: number; failed: number }> {
  requirePermission(ctx, "write");
  const now = opts.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const due = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.orgId),
        eq(invoices.status, "open"),
        or(isNull(invoices.aiAnalyzedAt), lt(invoices.aiAnalyzedAt, staleBefore)),
      ),
    )
    .orderBy(asc(invoices.aiAnalyzedAt), asc(invoices.dueDate));
  let analyzed = 0;
  let failed = 0;
  for (const { id } of due.slice(0, BULK_ANALYSIS_LIMIT)) {
    try {
      await analyzeInvoice(db, ctx, id, opts);
      analyzed += 1;
    } catch (err) {
      if (err instanceof AppError && err.code === "rate_limited") break;
      failed += 1;
    }
  }
  return { analyzed, failed, remaining: Math.max(0, due.length - analyzed - failed) };
}

// --- Drafting ----------------------------------------------------------------

export interface DraftResult {
  followUp: FollowUp;
  warnings: SafetyIssue[];
}

export async function generateDraft(
  db: Database,
  ctx: AuthContext,
  invoiceId: string,
  opts: AiOptions = {},
): Promise<DraftResult> {
  requirePermission(ctx, "write");
  const now = opts.now ?? new Date();
  let invoice = await getInvoice(db, ctx, invoiceId);
  if (invoice.status !== "open") throw new AppError("This invoice is paid. No follow-up is needed.");

  if (!invoice.aiAnalyzedAt) {
    await analyzeInvoice(db, ctx, invoiceId, opts);
    invoice = await getInvoice(db, ctx, invoiceId);
  }
  checkRateLimit(`ai:${ctx.orgId}`, LIMITS.ai);

  const [latest] = await db
    .select()
    .from(invoiceAnalyses)
    .where(and(eq(invoiceAnalyses.organizationId, ctx.orgId), eq(invoiceAnalyses.invoiceId, invoiceId)))
    .orderBy(desc(invoiceAnalyses.createdAt))
    .limit(1);
  const [sender] = await db
    .select({ name: users.name, orgName: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(users.id, ctx.userId), eq(users.organizationId, ctx.orgId)));
  if (!sender) throw new AppError("Your account could not be found.", "unauthenticated");

  const analysisCtx = await loadContext(db, ctx, invoice, now);
  const draftCtx: DraftContext = {
    facts: {
      invoice_number: invoice.invoiceNumber,
      amount: analysisCtx.facts.amount,
      invoice_date: invoice.invoiceDate,
      due_date: invoice.dueDate,
      days_overdue: analysisCtx.facts.days_overdue,
      follow_ups_sent: invoice.followUpCount,
      promise_to_pay_date: invoice.promiseToPayDate,
      customer_situation: latest?.customerSituation ?? "unknown",
      tone: latest?.recommendedTone ?? "friendly",
      sender_name: sender.name,
      organization_name: sender.orgName,
    },
    untrusted_text: {
      customer_name: invoice.customerName,
      invoice_notes: invoice.notes,
      recent_activity: analysisCtx.untrusted.activity_log.slice(-8),
    },
  };

  const provider = opts.provider ?? getAiProvider();
  const result = await callWithValidation(
    provider,
    { task: "draft", system: DRAFT_SYSTEM_PROMPT, user: buildDraftUserPrompt(draftCtx), context: draftCtx },
    draftOutputSchema,
  );

  let draft = result.data ? sanitizeDraft(result.data) : null;
  let source: "ai" | "template" = "ai";
  const guardNotes: string[] = [];
  if (!draft) {
    guardNotes.push(`AI provider unavailable (${result.error}); used the standard template.`);
  } else {
    const issues = checkDraftSafety(draft, draftCtx.facts);
    if (issues.length > 0) {
      guardNotes.push(`AI draft rejected: ${issues.map((i) => i.message).join(" ")}`);
      draft = null;
    }
  }
  if (!draft) {
    draft = sanitizeDraft(templateDraft(draftCtx));
    source = "template";
  }
  const finalDraft = draft;

  const followUp = await db.transaction(async (tx) => {
    const inFlight = await tx
      .select({ id: followUps.id })
      .from(followUps)
      .where(
        and(eq(followUps.organizationId, ctx.orgId), eq(followUps.invoiceId, invoiceId), eq(followUps.status, "sending")),
      );
    if (inFlight.length > 0) throw new AppError("A reminder for this invoice is being sent right now.", "conflict");
    await tx
      .update(followUps)
      .set({ status: "discarded", updatedAt: now })
      .where(
        and(
          eq(followUps.organizationId, ctx.orgId),
          eq(followUps.invoiceId, invoiceId),
          inArray(followUps.status, ["draft", "failed"]),
        ),
      );
    const [row] = await tx
      .insert(followUps)
      .values({
        organizationId: ctx.orgId,
        invoiceId,
        subject: finalDraft.subject,
        body: finalDraft.body,
        source,
        createdBy: ctx.userId,
      })
      .returning();
    await recordActivity(tx, {
      orgId: ctx.orgId,
      invoiceId,
      actorUserId: ctx.userId,
      type: "reminder_drafted",
      summary: `Reminder drafted (${source === "ai" ? "AI" : "standard template"}): "${finalDraft.subject}".`,
      metadata: { followUpId: row!.id, source, guardNotes },
    });
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "ai.draft_generated",
      targetType: "follow_up",
      targetId: row!.id,
      metadata: { provider: provider.name, model: provider.model, source, guardNotes },
    });
    return row!;
  });

  return { followUp, warnings: checkDraftSafety(finalDraft, draftCtx.facts) };
}

/** Invoice facts needed to run the safety checks on a (possibly edited) draft. */
export function draftSafetyFacts(invoice: Invoice) {
  return { invoice_number: invoice.invoiceNumber, amount: formatMoney(invoice.amountMinor, invoice.currency) };
}
