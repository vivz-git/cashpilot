import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Welcome back. Sign in to your agency&apos;s workspace.</p>
      <LoginForm />
      <p className="mt-6 text-sm text-slate-600">
        New to CashPilot?{" "}
        <Link className={linkClass} href="/signup">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
