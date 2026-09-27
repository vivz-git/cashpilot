import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { listTimeline } from "@/server/activities";
import { analyzeInvoice, generateDraft } from "@/server/ai/service";
import { listTeam } from "@/server/auth/service";
import { approveAndSend, updateDraft } from "@/server/email/send";
import { MockEmailProvider } from "@/server/email/provider";
import { getDashboard, getInvoice, getInvoiceDetail } from "@/server/invoices/queries";
import { recordOutcome } from "@/server/invoices/outcomes";
import { createInvoice, createOrg } from "../support/factories";

describe("organization isolation", () => {
  it("organization A cannot read, change, analyze, draft or send for organization B", async () => {
    const a = await createOrg("Agency A");
    const b = await createOrg("Agency B");
    const invoiceB = await createInvoice(b, { customer_name: "B's client", amount: "999.00" });
    const { followUp: draftB } = await generateDraft(getDb(), b, invoiceB);
    const db = getDb();
    const provider = new MockEmailProvider();

    await expect(getInvoice(db, a, invoiceB)).rejects.toThrow("Invoice not found");
    await expect(getInvoiceDetail(db, a, invoiceB)).rejects.toThrow("Invoice not found");
    await expect(analyzeInvoice(db, a, invoiceB)).rejects.toThrow("Invoice not found");
    await expect(generateDraft(db, a, invoiceB)).rejects.toThrow("Invoice not found");
    await expect(recordOutcome(db, a, invoiceB, { type: "paid" })).rejects.toThrow("Invoice not found");
    await expect(updateDraft(db, a, draftB.id, { subject: "hacked", body: "hacked" })).rejects.toThrow("Draft not found");
    await expect(approveAndSend(db, a, draftB.id, undefined, { provider })).rejects.toThrow("Draft not found");
    expect(provider.sent).toHaveLength(0);

    expect(await listTimeline(db, a, invoiceB)).toEqual([]);
    const dashA = await getDashboard(db, a);
    expect(dashA.priority).toHaveLength(0);
    expect(dashA.totals).toEqual([]);
    const teamA = await listTeam(db, a);
    expect(teamA.every((m) => m.id !== b.userId)).toBe(true);

    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceB));
    expect(row).toMatchObject({ status: "open", followUpCount: 0 });
  });

  it("treats malformed IDs as not found rather than erroring", async () => {
    const a = await createOrg();
    await expect(getInvoice(getDb(), a, "1 OR 1=1")).rejects.toThrow("Invoice not found");
    await expect(updateDraft(getDb(), a, "../../etc/passwd", { subject: "x", body: "y" })).rejects.toThrow("Draft not found");
  });
});
