import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="mb-4 text-base font-semibold">Sign in</h1>
      <LoginForm />
      <p className="mt-4 text-sm text-slate-600">
        New to CashPilot?{" "}
        <Link className="font-medium text-blue-700 hover:underline" href="/signup">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
