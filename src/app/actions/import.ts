"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/server/auth/session";
import { toUserMessage } from "@/server/errors";
import type { CsvInspection } from "@/lib/import-fields";
import { columnMappingSchema, type ColumnMapping, type ImportRowError } from "@/server/invoices/csv";
import { importInvoicesCsv } from "@/server/invoices/import";
import { checkRateLimit, LIMITS } from "@/server/rate-limit";

export type ImportState =
  | {
      error?: string;
      errors?: ImportRowError[];
      warnings?: string[];
      imported?: number;
      skippedDuplicates?: string[];
      /** The file needs its columns matched before it can be imported. */
      needsMapping?: CsvInspection;
      fileName?: string;
    }
  | undefined;

function readMapping(form: FormData): ColumnMapping | undefined | null {
  const raw = form.get("mapping");
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const parsed = columnMappingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function importCsvAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired. Please sign in again." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  const mapping = readMapping(form);
  if (mapping === null) return { error: "The column choices could not be read. Please choose the columns again." };
  try {
    checkRateLimit(`import:${session.ctx.orgId}`, LIMITS.import);
    const text = file.size <= 3 * 1024 * 1024 ? await file.text() : "";
    const result = await importInvoicesCsv(getDb(), session.ctx, { name: file.name, size: file.size, text }, mapping);
    if (!result.ok) {
      return {
        errors: result.errors.length > 0 ? result.errors : undefined,
        warnings: result.warnings,
        needsMapping: result.needsMapping,
        fileName: file.name,
      };
    }
    revalidatePath("/dashboard");
    return { imported: result.imported, skippedDuplicates: result.skippedDuplicates, warnings: result.warnings };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}
