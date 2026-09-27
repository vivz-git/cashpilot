"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Email</span>
        <input className={inputClass} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Password</span>
        <input className={inputClass} type="password" name="password" autoComplete="current-password" required />
      </label>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
