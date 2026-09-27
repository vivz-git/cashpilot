import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { activities, followUps, invoices } from "@/db/schema";
import { listTimeline } from "@/server/activities";
import { generateDraft } from "@/server/ai/service";
import { getDashboard } from "@/server/invoices/queries";
import { recordOutcome } from "@/server/invoices/outcomes";
import { addUser, createInvoice, createOrg } from "../support/factories";

const NOW = new Date("2026-09-15T12:00:00Z");

async function inv(id: string) {
  const [row] = await getDb().select().from(invoices).where(eq(invoices.id, id));
  return row!;
}

describe("manual outcome recording", () => {
  it("records a reply, a promise, a dispute and payment with timeline entries", async () => {
    const owner = await createOrg();
    const id = await createInvoice(owner, { due_date: "2026-08-01" });

    await recordOutcome(getDb(), owner, id, { type: "customer_replied", note: "Checking with their AP team." }, NOW);
    expect((await inv(id)).nextFollowUpDate).toBe("2026-09-22");

    await recordOutcome(getDb(), owner, id, { type: "promised_payment", promisedDate: "2026-09-30", note: "" }, NOW);
    expect(await inv(id)).toMatchObject({ promiseToPayDate: "2026-09-30", nextFollowUpDate: "2026-10-01" });

    await recordOutcome(getDb(), owner, id, { type: "dispute", note: "Says 5 hours were not agreed." }, NOW);
    expect(await inv(id)).toMatchObject({ disputeStatus: "open", disputeReason: "Says 5 hours were not agreed.", nextFollowUpDate: null });

    await recordOutcome(getDb(), owner, id, { type: "dispute_resolved", note: "Credit note agreed." }, NOW);
    expect((await inv(id)).disputeStatus).toBe("resolved");

    await recordOutcome(getDb(), owner, id, { type: "note", note: "Called Sam, friendly." }, NOW);
    await recordOutcome(getDb(), owner, id, { type: "paid", note: "Ref 88121" }, NOW);
    expect(await inv(id)).toMatchObject({ status: "paid", nextFollowUpDate: null });

    const timeline = await listTimeline(getDb(), owner, id);
    expect(timeline.map((t) => t.type).reverse()).toEqual([
      "invoice_imported",
      "customer_replied",
      "payment_promised",
      "dispute_created",
      "dispute_resolved",
      "note_added",
      "payment_received",
    ]);
    expect(timeline.filter((t) => t.type !== "invoice_imported").every((t) => t.source === "manual")).toBe(true);
  });

  it("validates input", async () => {
    const owner = await createOrg();
    const id = await createInvoice(owner, { invoice_date: "2026-06-01" });
    await expect(recordOutcome(getDb(), owner, id, { type: "promised_payment", promisedDate: "next week" })).rejects.toThrow("valid date");
    await expect(recordOutcome(getDb(), owner, id, { type: "promised_payment", promisedDate: "2026-01-01" })).rejects.toThrow("before the invoice date");
    await expect(recordOutcome(getDb(), owner, id, { type: "dispute", note: "   " })).rejects.toThrow("required");
    await expect(recordOutcome(getDb(), owner, id, { type: "delete_everything" })).rejects.toThrow();
    await expect(recordOutcome(getDb(), owner, id, { type: "note", note: "x".repeat(2001) })).rejects.toThrow("too long");
  });

  it("marking paid discards open drafts and removes the invoice from the queue", async () => {
    const owner = await createOrg();
    const id = await createInvoice(owner, { due_date: "2026-08-01" });
    const { followUp } = await generateDraft(getDb(), owner, id, { now: NOW });
    await recordOutcome(getDb(), owner, id, { type: "paid" }, NOW);
    const [fu] = await getDb().select().from(followUps).where(eq(followUps.id, followUp.id));
    expect(fu!.status).toBe("discarded");
    const d = await getDashboard(getDb(), owner, NOW);
    expect(d.priority.find((r) => r.id === id)).toBeUndefined();
    await expect(recordOutcome(getDb(), owner, id, { type: "customer_replied", note: "x" })).rejects.toThrow("already marked as paid");
  });

  it("dashboard lists promised and disputed invoices and today's attention items", async () => {
    const owner = await createOrg();
    const promised = await createInvoice(owner, { due_date: "2026-08-01" });
    const broken = await createInvoice(owner, { due_date: "2026-08-01" });
    const disputed = await createInvoice(owner, { due_date: "2026-08-01" });
    const fresh = await createInvoice(owner, { due_date: "2026-08-01" });
    const notDue = await createInvoice(owner, { due_date: "2026-12-01" });
    await recordOutcome(getDb(), owner, promised, { type: "promised_payment", promisedDate: "2026-09-25" }, NOW);
    await recordOutcome(getDb(), owner, broken, { type: "promised_payment", promisedDate: "2026-09-10" }, NOW);
    await recordOutcome(getDb(), owner, disputed, { type: "dispute", note: "Wrong PO" }, NOW);

    const d = await getDashboard(getDb(), owner, NOW);
    expect(d.promised.map((r) => r.id)).toEqual([broken, promised]);
    expect(d.disputed.map((r) => r.id)).toEqual([disputed]);
    const attention = Object.fromEntries(d.needsAttention.map((r) => [r.id, r.attention]));
    expect(attention).toEqual({ [broken]: "promise_broken", [fresh]: "never_contacted" });
    expect(d.priority.map((r) => r.id)).toContain(notDue);
  });

  it("viewers cannot record outcomes and other organizations cannot see the invoice", async () => {
    const owner = await createOrg();
    const viewer = await addUser(owner, "viewer");
    const other = await createOrg("Other");
    const id = await createInvoice(owner);
    await expect(recordOutcome(getDb(), viewer, id, { type: "paid" })).rejects.toThrow("permission");
    await expect(recordOutcome(getDb(), other, id, { type: "paid" })).rejects.toThrow("Invoice not found");
    expect((await inv(id)).status).toBe("open");
    const acts = await getDb().select().from(activities).where(eq(activities.invoiceId, id));
    expect(acts).toHaveLength(1);
  });
});
