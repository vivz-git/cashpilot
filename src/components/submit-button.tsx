"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  disabled,
  name,
  value,
  block = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  name?: string;
  value?: string;
  /** Full width, for single-column forms. */
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={`${buttonClass[variant]} ${block ? "w-full py-2.5" : ""}`}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
