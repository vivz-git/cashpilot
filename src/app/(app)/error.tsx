"use client";

import { AlertIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-10 place-items-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100">
        <AlertIcon className="size-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-1.5 text-sm text-slate-600">The page could not be loaded. Your data has not been changed.</p>
      <button onClick={reset} className={`${buttonClass.secondary} mt-5`}>
        Try again
      </button>
    </div>
  );
}
