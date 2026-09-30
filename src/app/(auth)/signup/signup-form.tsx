"use client";

import { useActionState } from "react";
import { signupAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, inputClass } from "@/components/ui";

export function SignupForm() {
  const [state, action] = useActionState(signupAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Agency name</span>
        <input className={inputClass} name="organizationName" autoComplete="organization" required maxLength={120} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Your name</span>
        <input className={inputClass} name="name" autoComplete="name" required maxLength={100} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Work email</span>
        <input className={inputClass} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Password</span>
        <input className={inputClass} type="password" name="password" autoComplete="new-password" required minLength={10} />
        <span className="mt-1 block text-xs text-slate-500">At least 10 characters.</span>
      </label>
      <SubmitButton pendingText="Creating…">Create workspace</SubmitButton>
    </form>
  );
}
