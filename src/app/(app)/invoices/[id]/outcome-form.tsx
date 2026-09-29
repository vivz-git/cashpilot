"use client";

import { useActionState, useState } from "react";
import { recordOutcomeAction } from "@/app/actions/invoices";
import { SubmitButton } from "@/components/submit-button";
import { Alert, inputClass } from "@/components/ui";

const OPTIONS = [
  { value: "customer_replied", label: "Customer replied", note: "What did they say?", noteRequired: true },
  { value: "promised_payment", label: "Promised payment", note: "Optional details", noteRequired: false },
  { value: "dispute", label: "Dispute", note: "What is disputed?", noteRequired: true },
  { value: "dispute_resolved", label: "Dispute resolved", note: "Optional details", noteRequired: false },
  { value: "paid", label: "Paid", note: "Optional details (e.g. payment reference)", noteRequired: false },
  { value: "no_response", label: "No response", note: "Optional details (e.g. called, no answer)", noteRequired: false },
  { value: "note", label: "Internal note", note: "Note", noteRequired: true },
] as const;

export function OutcomeForm({ invoiceId, isOpen, disputeOpen }: { invoiceId: string; isOpen: boolean; disputeOpen: boolean }) {
  const [state, action] = useActionState(recordOutcomeAction, undefined);
  const available = OPTIONS.filter((o) => {
    if (!isOpen) return o.value === "note";
    if (o.value === "dispute") return !disputeOpen;
    if (o.value === "dispute_resolved") return disputeOpen;
    return true;
  });
  const [type, setType] = useState<string>(available[0]!.value);
  const selected = available.find((o) => o.value === type) ?? available[0]!;

  return (
    <form action={action} className="space-y-3" data-testid="outcome-form">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">Outcome</span>
        <select name="type" className={inputClass} value={selected.value} onChange={(e) => setType(e.target.value)}>
          {available.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {selected.value === "promised_payment" && (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">Promised payment date</span>
          <input type="date" name="promisedDate" className={inputClass} required />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">{selected.note}</span>
        <textarea name="note" className={`${inputClass} min-h-20`} maxLength={2000} required={selected.noteRequired} />
      </label>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton pendingText="Saving…">Record</SubmitButton>
    </form>
  );
}
