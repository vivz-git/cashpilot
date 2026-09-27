"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importCsvAction } from "@/app/actions/import";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

export function ImportForm() {
  const [state, action] = useActionState(importCsvAction, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label="CSV file"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
        />
        <SubmitButton pendingText="Importing…">Import</SubmitButton>
      </form>

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      {state?.errors && (
        <div className="space-y-2" data-testid="import-errors">
          <Alert tone="error">
            The file was not imported. Fix {state.errors.length === 1 ? "this problem" : `these ${state.errors.length} problems`} and upload it again.
          </Alert>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Line</th>
                  <th className="py-1 pr-3 font-medium">Column</th>
                  <th className="py-1 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="num py-1 pr-3">{e.line || "—"}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{e.column ?? "—"}</td>
                    <td className="py-1">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state?.imported !== undefined && (
        <Alert tone="success">
          Imported {state.imported} invoice{state.imported === 1 ? "" : "s"}.{" "}
          {state.skippedDuplicates && state.skippedDuplicates.length > 0 && (
            <>Skipped {state.skippedDuplicates.length} already in CashPilot: {state.skippedDuplicates.slice(0, 10).join(", ")}{state.skippedDuplicates.length > 10 ? "…" : ""}. </>
          )}
          <Link href="/dashboard" className="font-medium underline">Go to dashboard</Link>
        </Alert>
      )}

      {state?.warnings && state.warnings.length > 0 && (
        <Alert tone="warning">{state.warnings.join(" ")}</Alert>
      )}
    </div>
  );
}
