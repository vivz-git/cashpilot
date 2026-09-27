import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight text-slate-900">
              CashPilot
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600" aria-label="Main">
              <Link className="hover:text-slate-900" href="/dashboard">Dashboard</Link>
              <Link className="hover:text-slate-900" href="/import">Import</Link>
              <Link className="hover:text-slate-900" href="/team">Team</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline" data-testid="current-user">
              {session.user.name} · {session.organization.name}
              {session.user.role === "viewer" && " · read-only"}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
