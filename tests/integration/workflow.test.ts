import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { listTimeline } from "@/server/activities";
import { analyzeOutstanding, generateDraft } from "@/server/ai/service";
import { MockEmailProvider } from "@/server/email/provider";
import { approveAndSend, updateDraft } from "@/server/email/send";
import { getDashboard, getInvoiceDetail } from "@/server/invoices/queries";
import { createOrg, csvRow, importRows } from "../support/factories";

describe("complete collections workflow", () => {
  it("CSV import → stored → AI analysis → priority → draft → edit → approve → send → timeline", async () => {
    const owner = await createOrg("Brightline Creative");
    const now = new Date();

    // 1. CSV import
    const imported = await importRows(owner, [
      csvRow({ invoice_number: "BL-1001", customer_name: "Northwind Studio", customer_email: "ap@northwind.example", invoice_date: "2026-04-01", due_date: "2026-05-01", amount: "12400.00" }),
      csvRow({ invoice_number: "BL-1002", customer_name: "Harbor Coffee", customer_email: "accounts@harbor.example", due_date: "2026-08-20", amount: "900.00" }),
      csvRow({ invoice_number: "BL-1003", customer_name: "Kite Labs", customer_email: "finance@kite.example", due_date: "2099-01-01", invoice_date: "2026-09-01", amount: "3000.00", currency: "EUR" }),
    ]);
    expect(imported).toMatchObject({ ok: true, imported: 3 });

    // 2. Stored + 3. analyzed
    expect(await analyzeOutstanding(getDb(), owner, { now })).toMatchObject({ analyzed: 3, failed: 0 });

    // 4. Priority queue: the oldest, largest overdue invoice comes first
    const dash = await getDashboard(getDb(), owner, now);
    expect(dash.priority.map((r) => r.invoiceNumber)).toEqual(["BL-1001", "BL-1002", "BL-1003"]);
    expect(dash.priority.every((r) => r.aiPriority !== null && r.aiRecommendedAction)).toBe(true);
    const top = dash.priority[0]!;

    // 5. Follow-up generated
    const { followUp } = await generateDraft(getDb(), owner, top.id, { now });
    expect(followUp.body).toContain("BL-1001");

    // 6. User edits
    const edited = `${followUp.body}\n\nP.S. Happy to resend the invoice PDF if useful.`;
    const { followUp: saved, warnings } = await updateDraft(getDb(), owner, followUp.id, { subject: followUp.subject, body: edited });
    expect(saved.edited).toBe(true);
    expect(warnings).toEqual([]);

    // 7. Approval + 8. email sent
    const provider = new MockEmailProvider();
    const sent = await approveAndSend(getDb(), owner, followUp.id, { subject: saved.subject, body: saved.body }, { provider, now });
    expect(sent.ok).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: "ap@northwind.example", text: edited });

    // 9. Activity recorded
    const detail = await getInvoiceDetail(getDb(), owner, top.id, now);
    expect(detail.invoice.followUpCount).toBe(1);
    expect(detail.emails[0]).toMatchObject({ status: "sent", recipient: "ap@northwind.example" });
    const timeline = (await listTimeline(getDb(), owner, top.id)).map((t) => t.type).reverse();
    expect(timeline).toEqual(["invoice_imported", "ai_analyzed", "reminder_drafted", "reminder_edited", "reminder_sent"]);
  });
});
