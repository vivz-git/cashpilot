"use client";

import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions/invoices";
import { buttonClass } from "./ui";

/** Button that runs a server action and shows its result next to it. */
export function ActionButton({
  action,
  children,
  pendingText,
  variant = "secondary",
  disabled,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  pendingText: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();

  // Success messages fade after a few seconds; errors stay until the next attempt.
  useEffect(() => {
    if (!result?.success || result.error) return;
    const t = setTimeout(() => setResult(undefined), 5000);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!pending && result?.error && (
        <span role="alert" className="max-w-xs text-sm text-red-700">{result.error}</span>
      )}
      {!pending && result?.success && (
        <span role="status" className="text-sm text-emerald-700">{result.success}</span>
      )}
      <button
        type="button"
        disabled={pending || disabled}
        aria-busy={pending}
        className={buttonClass[variant]}
        onClick={() =>
          start(async () => {
            setResult(undefined);
            setResult(await action());
          })
        }
      >
        {pending ? pendingText : children}
      </button>
    </div>
  );
}
