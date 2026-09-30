import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <BrandMark className="size-9" />
      <h1 className="mt-5 text-lg font-semibold tracking-tight text-ink">Not found</h1>
      <p className="mt-1.5 text-sm text-slate-600">This page does not exist or you do not have access to it.</p>
      <Link href="/dashboard" className={`${buttonClass.secondary} mt-5`}>Back to dashboard</Link>
    </main>
  );
}
