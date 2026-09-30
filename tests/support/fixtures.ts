import type { Activity, Invoice } from "@/db/schema";
import type { AiProvider, AiRequest } from "@/server/ai/types";

export const NOW = new Date("2026-09-15T12:00:00Z");

export function makeInvoice(p: Partial<Invoice> = {}): Invoice {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    importId: null,
    invoiceNumber: "INV-2041",
    customerName: "Northwind Studio",
    customerEmail: "ap@northwind.example",
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-31",
    amountMinor: 425000,
    currency: "USD",
    accountManager: "Priya Shah",
    notes: null,
    status: "open",
    paidAt: null,
    disputeStatus: "none",
    disputeReason: null,
    lastContactAt: null,
    nextFollowUpDate: null,
    followUpCount: 0,
    promiseToPayDate: null,
    aiPriority: null,
    aiReason: null,
    aiRecommendedAction: null,
    aiSituation: null,
    aiConfidence: null,
    aiAnalyzedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

export function act(type: Activity["type"], summary: string, daysAgo: number): Pick<Activity, "type" | "summary" | "createdAt"> {
  return { type, summary, createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000) };
}

/** Provider that returns scripted responses in order (strings, objects or errors) and records requests. */
export class ScriptedProvider implements AiProvider {
  readonly name = "scripted";
  readonly model = "scripted-model";
  readonly requests: AiRequest[] = [];
  private readonly queue: (string | object | Error)[];

  constructor(...responses: (string | object | Error)[]) {
    this.queue = responses;
  }

  async complete(request: AiRequest): Promise<string> {
    this.requests.push(request);
    const next = this.queue.length > 1 ? this.queue.shift()! : this.queue[0];
    if (next === undefined) throw new Error("no scripted response");
    if (next instanceof Error) throw next;
    return typeof next === "string" ? next : JSON.stringify(next);
  }
}

export function analysis(p: Record<string, unknown> = {}) {
  return {
    priority_score: 6,
    reason: "Invoice is 46 days overdue with no contact yet.",
    customer_situation: "unknown",
    recommended_action: "Send a friendly first reminder.",
    recommended_tone: "friendly",
    confidence: "low",
    missing_information: [],
    evidence: [],
    ...p,
  };
}
