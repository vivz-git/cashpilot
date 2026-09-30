"use client";

import { useActionState } from "react";
import { addTeamMemberAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, inputClass } from "@/components/ui";

export function AddMemberForm() {
  const [state, action] = useActionState(addTeamMemberAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">Name</span>
        <input className={inputClass} name="name" required maxLength={100} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">Email</span>
        <input className={inputClass} type="email" name="email" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">Initial password</span>
        <input className={inputClass} type="password" name="password" required minLength={10} autoComplete="new-password" />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">Role</span>
        <select className={inputClass} name="role" defaultValue="member">
          <option value="member">Member — import, analyze, draft and send</option>
          <option value="viewer">Viewer — read-only</option>
        </select>
      </label>
      <div className="space-y-2 sm:col-span-2">
        {state?.error && <Alert tone="error">{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <SubmitButton pendingText="Adding…">Add teammate</SubmitButton>
      </div>
    </form>
  );
}
