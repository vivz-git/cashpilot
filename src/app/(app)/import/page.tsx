import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui";
import { can } from "@/server/auth/context";
import { requireSession } from "@/server/auth/session";
import { MAX_CSV_ROWS, OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from "@/server/invoices/csv";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import invoices" };

const EXAMPLE = `customer_name,customer_email,invoice_number,invoice_date,due_date,amount,currency,account_manager,notes
Northwind Studio,ap@northwind.example,INV-1042,2026-07-01,2026-07-31,4250.00,USD,Priya Shah,Retainer for July
Blue Harbor Ltd,finance@blueharbor.example,INV-1043,2026-07-15,2026-08-14,1800.00,GBP,Sam Lee,`;

export default async function ImportPage() {
  const session = await requireSession();
  const canWrite = can(session.ctx, "write");
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import invoices</h1>
        <p className="text-sm text-slate-500">Upload a CSV export of your open invoices. Nothing is imported if any row has an error.</p>
      </div>
      {canWrite ? (
        <Card title="Upload CSV">
          <ImportForm />
        </Card>
      ) : (
        <Alert tone="info">Your role is read-only. Ask an owner or member to import invoices.</Alert>
      )}
      <Card title="File format">
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-medium">Required columns:</span> {REQUIRED_COLUMNS.join(", ")}.<br />
            <span className="font-medium">Optional columns:</span> {OPTIONAL_COLUMNS.join(", ")}.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Dates must be in YYYY-MM-DD format (e.g. 2026-07-31).</li>
            <li>Amounts use a decimal point without currency symbols (e.g. 4250.00). Thousands separators are allowed.</li>
            <li>Currency is a 3-letter ISO code (USD, EUR, GBP…). Mixed currencies are fine; totals are shown per currency.</li>
            <li>Invoice numbers already in CashPilot are skipped, not overwritten.</li>
            <li>Up to {MAX_CSV_ROWS.toLocaleString()} rows and 2 MB per file.</li>
          </ul>
          <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{EXAMPLE}</pre>
        </div>
      </Card>
    </div>
  );
}
