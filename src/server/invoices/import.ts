import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { imports, invoices } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { recordActivity } from "../activities";
import { audit } from "../audit";
import { requirePermission, type AuthContext } from "../auth/context";
import { AppError } from "../errors";
import { MAX_CSV_BYTES, parseInvoiceCsv, type ImportRowError } from "./csv";

export type ImportResult =
  | {
      ok: true;
      importId: string;
      imported: number;
      skippedDuplicates: string[];
      warnings: string[];
    }
  | { ok: false; errors: ImportRowError[]; warnings: string[] };

export async function importInvoicesCsv(
  db: Database,
  ctx: AuthContext,
  file: { name: string; text: string; size: number },
): Promise<ImportResult> {
  requirePermission(ctx, "write");
  if (file.size > MAX_CSV_BYTES) {
    throw new AppError(`File is too large. The limit is ${MAX_CSV_BYTES / 1024 / 1024} MB.`);
  }
  if (!/\.csv$/i.test(file.name)) {
    throw new AppError("Please upload a .csv file.");
  }

  const parsed = parseInvoiceCsv(file.text);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const numbers = parsed.rows.map((r) => r.invoiceNumber);
    const existing = await tx
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.orgId),
          inArray(
            sql`lower(${invoices.invoiceNumber})`,
            numbers.map((n) => n.toLowerCase()),
          ),
        ),
      );
    const existingSet = new Set(existing.map((e) => e.invoiceNumber.toLowerCase()));
    const toInsert = parsed.rows.filter((r) => !existingSet.has(r.invoiceNumber.toLowerCase()));
    const skippedDuplicates = parsed.rows
      .filter((r) => existingSet.has(r.invoiceNumber.toLowerCase()))
      .map((r) => r.invoiceNumber);

    const [imp] = await tx
      .insert(imports)
      .values({
        organizationId: ctx.orgId,
        userId: ctx.userId,
        filename: file.name.slice(0, 200),
        rowCount: parsed.rows.length,
        importedCount: toInsert.length,
        skippedCount: skippedDuplicates.length,
      })
      .returning();

    let importedCount = 0;
    if (toInsert.length > 0) {
      const inserted = await tx
        .insert(invoices)
        .values(
          toInsert.map((r) => ({
            organizationId: ctx.orgId,
            importId: imp!.id,
            invoiceNumber: r.invoiceNumber,
            customerName: r.customerName,
            customerEmail: r.customerEmail,
            invoiceDate: r.invoiceDate,
            dueDate: r.dueDate,
            amountMinor: r.amountMinor,
            currency: r.currency,
            accountManager: r.accountManager,
            notes: r.notes,
          })),
        )
        // Backstop for a concurrent import of the same numbers; the pre-check above reports them.
        .onConflictDoNothing()
        .returning({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          amountMinor: invoices.amountMinor,
          currency: invoices.currency,
        });
      importedCount = inserted.length;
      if (importedCount !== toInsert.length) {
        const insertedSet = new Set(inserted.map((i) => i.invoiceNumber.toLowerCase()));
        for (const r of toInsert) {
          if (!insertedSet.has(r.invoiceNumber.toLowerCase())) skippedDuplicates.push(r.invoiceNumber);
        }
        await tx
          .update(imports)
          .set({ importedCount, skippedCount: skippedDuplicates.length })
          .where(eq(imports.id, imp!.id));
      }
      for (const inv of inserted) {
        await recordActivity(tx, {
          orgId: ctx.orgId,
          invoiceId: inv.id,
          actorUserId: ctx.userId,
          type: "invoice_imported",
          summary: `Invoice ${inv.invoiceNumber} imported (${formatMoney(inv.amountMinor, inv.currency)}) from ${file.name.slice(0, 200)}.`,
          metadata: { importId: imp!.id },
        });
      }
    }

    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invoices.imported",
      targetType: "import",
      targetId: imp!.id,
      metadata: { imported: importedCount, skipped: skippedDuplicates.length },
    });

    return {
      ok: true as const,
      importId: imp!.id,
      imported: importedCount,
      skippedDuplicates,
      warnings: parsed.warnings,
    };
  });
}
