import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create your workspace</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">One workspace per agency. You can add teammates later.</p>
      <SignupForm />
      <p className="mt-6 text-sm text-slate-600">
        Already have an account?{" "}
        <Link className={linkClass} href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
