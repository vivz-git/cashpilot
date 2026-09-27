import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">This page does not exist or you do not have access to it.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline">Back to dashboard</Link>
    </main>
  );
}
