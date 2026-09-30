"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { importCsvAction, type ImportState } from "@/app/actions/import";
import { UploadIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { Alert, buttonClass, inputClass } from "@/components/ui";
import {
  FIELD_LABELS,
  INVOICE_FIELDS,
  OPTIONAL_COLUMNS,
  type CsvInspection,
  type DateFormat,
  type InvoiceField,
} from "@/lib/import-fields";

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  ymd: "Year first: 2026-03-31",
  dmy: "Day first: 31/03/2026",
  mdy: "Month first: 03/31/2026",
};

const OPTIONAL = new Set<InvoiceField>(OPTIONAL_COLUMNS);

export function ImportForm() {
  const [state, action, pending] = useActionState(importCsvAction, undefined);
  const input = useRef<HTMLInputElement>(null);
  // The uploaded file is kept for the column-matching step (React clears the input after an action).
  const [file, setFile] = useState<File | null>(null);
  // Choosing another file hides results that belong to the previous one.
  const [stale, setStale] = useState(false);
  const visible = stale ? undefined : state;

  function submitMapping(mapping: string) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mapping", mapping);
    startTransition(() => action(fd));
  }

  const stage = visible?.imported !== undefined ? 3 : visible?.needsMapping ? 2 : 1;

  return (
    <div className="space-y-5">
      <ImportSteps stage={stage} />
      <form
        action={action}
        onSubmit={() => {
          setFile(input.current?.files?.[0] ?? null);
          setStale(false);
        }}
        className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-5 transition-colors focus-within:border-brand-500 hover:border-slate-400 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-card ring-1 ring-slate-200/80">
            <UploadIcon className="size-5" />
          </span>
          <input
            ref={input}
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            aria-label="CSV file"
            onChange={() => setStale(true)}
            className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink file:shadow-xs file:ring-1 file:ring-inset file:ring-slate-300 hover:file:bg-slate-50"
          />
        </div>
        <SubmitButton pendingText="Importing…">Import</SubmitButton>
      </form>

      {visible?.needsMapping &&
        (file ? (
          <ColumnMatcher
            key={`${visible.fileName}:${visible.needsMapping.headers.join("|")}`}
            inspection={visible.needsMapping}
            fileName={visible.fileName ?? file.name}
            pending={pending}
            onSubmit={submitMapping}
          />
        ) : (
          <Alert tone="info">This file uses different column names. Choose it again and click Import to match its columns.</Alert>
        ))}

      <ImportResultView state={visible} />
    </div>
  );
}

const STEPS = ["Upload file", "Match columns", "Imported"];

function ImportSteps({ stage }: { stage: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Import steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < stage ? "done" : n === stage ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`grid size-5 place-items-center rounded-full font-semibold ${
                state === "done" ? "bg-emerald-600 text-white" : state === "current" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {n}
            </span>
            <span className={state === "current" ? "font-medium text-ink" : "text-slate-500"}>
              {label}
              {n === 2 && <span className="text-slate-400"> (if needed)</span>}
            </span>
            {n < STEPS.length && <span aria-hidden="true" className="h-px w-6 bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function ImportResultView({ state }: { state: ImportState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {state.errors && (
        <div className="space-y-2" data-testid="import-errors">
          <Alert tone="error">
            The file was not imported. Fix {state.errors.length === 1 ? "this problem" : `these ${state.errors.length} problems`}{" "}
            {state.needsMapping ? "or change the column choices above" : "and upload it again"}.
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

      {state.imported !== undefined && (
        <Alert tone="success">
          Imported {state.imported} invoice{state.imported === 1 ? "" : "s"}.{" "}
          {state.skippedDuplicates && state.skippedDuplicates.length > 0 && (
            <>Skipped {state.skippedDuplicates.length} already in CashPilot: {state.skippedDuplicates.slice(0, 10).join(", ")}{state.skippedDuplicates.length > 10 ? "…" : ""}. </>
          )}
          <Link href="/dashboard" className="font-medium underline">Go to dashboard</Link>
        </Alert>
      )}

      {state.warnings && state.warnings.length > 0 && <Alert tone="warning">{state.warnings.join(" ")}</Alert>}
    </>
  );
}

/** Lets the user say which column in their export holds each invoice field. Nothing is guessed silently. */
function ColumnMatcher({
  inspection,
  fileName,
  pending,
  onSubmit,
}: {
  inspection: CsvInspection;
  fileName: string;
  pending: boolean;
  onSubmit: (mapping: string) => void;
}) {
  const [columns, setColumns] = useState<Partial<Record<InvoiceField, string>>>(inspection.suggested);
  const [dateFormat, setDateFormat] = useState<DateFormat | "">(inspection.dateFormat ?? "");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const noEmailColumn = !inspection.suggested.customer_email;

  return (
    <form
      data-testid="column-matcher"
      className="space-y-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-raised"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(JSON.stringify({ columns, dateFormat, defaultCurrency: columns.currency ? undefined : defaultCurrency }));
      }}
    >
      <div>
        <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink">Match your columns</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          {fileName} ({inspection.rowCount} row{inspection.rowCount === 1 ? "" : "s"}) doesn&apos;t use CashPilot&apos;s column
          names. Check which column holds each field. Suggestions are based on common accounting-export names.
          Nothing is imported until you confirm.
        </p>
      </div>

      {noEmailColumn && (
        <Alert tone="warning">
          No customer email column was found. CashPilot needs an email address for every invoice to send reminders. If
          your export has no email column, add one (for example from your customer list) and upload the file again.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {INVOICE_FIELDS.map((field) => {
          const id = `map-${field}`;
          const header = columns[field];
          return (
            <div key={field}>
              <label htmlFor={id} className="block text-sm font-medium text-slate-800">
                {FIELD_LABELS[field]}
                {OPTIONAL.has(field) && <span className="font-normal text-slate-500"> (optional)</span>}
              </label>
              <select
                id={id}
                className={`${inputClass} mt-1`}
                value={header ?? ""}
                required={!OPTIONAL.has(field) && field !== "currency"}
                onChange={(e) => setColumns((c) => ({ ...c, [field]: e.target.value || undefined }))}
              >
                <option value="">{field === "currency" ? "Same currency for all rows" : "Not in this file"}</option>
                {inspection.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              {header && inspection.samples[header] && (
                <p className="mt-0.5 truncate text-xs text-slate-500">e.g. {inspection.samples[header]}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {!columns.currency && (
          <div>
            <label htmlFor="map-default-currency" className="block text-sm font-medium text-slate-800">
              Currency for all rows
            </label>
            <input
              id="map-default-currency"
              className={`${inputClass} mt-1 uppercase`}
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
              placeholder="USD"
              aria-describedby="map-default-currency-hint"
            />
            <p id="map-default-currency-hint" className="mt-0.5 text-xs text-slate-500">3-letter code such as USD, GBP or EUR.</p>
          </div>
        )}
        <div>
          <label htmlFor="map-date-format" className="block text-sm font-medium text-slate-800">Date format</label>
          <select
            id="map-date-format"
            className={`${inputClass} mt-1`}
            value={dateFormat}
            required
            onChange={(e) => setDateFormat(e.target.value as DateFormat | "")}
            aria-describedby="map-date-format-hint"
          >
            <option value="">Choose…</option>
            {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => (
              <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>
            ))}
          </select>
          <p id="map-date-format-hint" className="mt-0.5 text-xs text-slate-500">
            {inspection.dateFormat === null
              ? "Your dates could be read day-first or month-first (e.g. 03/04/2026). Choose the one your accounting tool uses."
              : "Detected from your file. Dates with month names (e.g. 15 Jul 2026) are always understood."}
          </p>
        </div>
      </div>

      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass.primary}>
        {pending ? "Importing…" : "Import with these columns"}
      </button>
    </form>
  );
}
