"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { approveAndSendAction, saveDraftAction } from "@/app/actions/invoices";
import { Alert, Badge, buttonClass, inputClass } from "@/components/ui";
import { checkDraftSafety } from "@/server/ai/drafting";

export function DraftEditor(props: {
  invoiceId: string;
  followUpId: string;
  subject: string;
  body: string;
  source: string;
  failed: boolean;
  lastError: string | null;
  recipient: string;
  invoiceNumber: string;
  amount: string;
  canEdit: boolean;
  canSend: boolean;
  disputed: boolean;
}) {
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [saveState, saveAction] = useActionState(saveDraftAction, undefined);
  const [sendState, sendAction] = useActionState(approveAndSendAction, undefined);

  const issues = useMemo(
    () => checkDraftSafety({ subject, body }, { invoice_number: props.invoiceNumber, amount: props.amount }),
    [subject, body, props.invoiceNumber, props.amount],
  );
  const dirty = subject !== props.subject || body !== props.body;
  const words = body.split(/\s+/).filter(Boolean).length;

  return (
    <form className="space-y-3" data-testid="draft-editor">
      <input type="hidden" name="invoiceId" value={props.invoiceId} />
      <input type="hidden" name="followUpId" value={props.followUpId} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>To <span className="font-medium text-slate-800">{props.recipient}</span></span>
        <Badge>{props.source === "ai" ? "AI draft" : "Standard template"}</Badge>
        {dirty && <Badge tone="amber">Unsaved changes</Badge>}
      </div>

      {props.failed && (
        <Alert tone="error">
          The last send attempt failed{props.lastError ? `: ${props.lastError}` : "."} Review the draft and try again.
        </Alert>
      )}
      {props.disputed && (
        <Alert tone="warning">This invoice is disputed. Make sure this message addresses the dispute rather than asking for payment.</Alert>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Subject</span>
        <input
          className={inputClass}
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          required
          readOnly={!props.canEdit}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 flex justify-between font-medium text-slate-700">
          Message <span className="font-normal text-slate-500">{words} words · plain text</span>
        </span>
        <textarea
          className={`${inputClass} min-h-72 font-sans leading-relaxed`}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          required
          readOnly={!props.canEdit}
        />
      </label>

      {issues.length > 0 && (
        <Alert tone="warning">
          <p className="font-medium">Review before sending:</p>
          <ul className="list-disc pl-5">
            {issues.map((i, idx) => <li key={idx}>{i.message}</li>)}
          </ul>
        </Alert>
      )}

      {saveState?.error && <Alert tone="error">{saveState.error}</Alert>}
      {saveState?.success && !dirty && <Alert tone="success">{saveState.success}</Alert>}
      {sendState?.error && <Alert tone="error">{sendState.error}</Alert>}
      {sendState?.success && <Alert tone="success">{sendState.success}</Alert>}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Nothing is sent until you click Approve &amp; Send. The email goes to {props.recipient} as plain text and replies come to your address.
        </p>
        <DraftButtons
          canEdit={props.canEdit}
          canSend={props.canSend}
          dirty={dirty}
          failed={props.failed}
          saveAction={saveAction}
          sendAction={sendAction}
        />
      </div>
    </form>
  );
}

function DraftButtons({
  canEdit,
  canSend,
  dirty,
  failed,
  saveAction,
  sendAction,
}: {
  canEdit: boolean;
  canSend: boolean;
  dirty: boolean;
  failed: boolean;
  saveAction: (form: FormData) => void;
  sendAction: (form: FormData) => void;
}) {
  const { pending, action } = useFormStatus();
  const sending = pending && action === sendAction;
  const saving = pending && action === saveAction;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {canEdit && (
        <button type="submit" formAction={saveAction} disabled={pending || !dirty} className={buttonClass.secondary}>
          {saving ? "Saving…" : "Save draft"}
        </button>
      )}
      {canSend ? (
        <button
          type="submit"
          formAction={sendAction}
          disabled={pending}
          aria-busy={sending}
          className={buttonClass.primary}
        >
          {sending ? "Sending…" : failed ? "Retry Approve & Send" : "Approve & Send"}
        </button>
      ) : (
        <span className="text-xs text-slate-500">Your role cannot send emails.</span>
      )}
    </div>
  );
}
