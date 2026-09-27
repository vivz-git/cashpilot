import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="mb-1 text-base font-semibold">Create your workspace</h1>
      <p className="mb-4 text-sm text-slate-600">One workspace per agency. You can add teammates later.</p>
      <SignupForm />
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-medium text-blue-700 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
