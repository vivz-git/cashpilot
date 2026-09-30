import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/server/auth/session";
import { getRuntimeModes, type RuntimeModes } from "@/server/runtime-mode";

/** Tells everyone when emails are not really delivered or analysis is not real AI. */
function ModeBanner({ modes }: { modes: RuntimeModes }) {
  const lines: string[] = [];
  if (modes.email === "mock") lines.push("Test mode: emails are recorded in CashPilot but not delivered to customers.");
  if (modes.email === "misconfigured") lines.push("Email delivery is not configured correctly. Sending will fail until an administrator fixes it.");
  if (modes.ai === "mock") lines.push("AI analysis is in offline mode: it uses simple rules and does not read notes imported from CSV.");
  if (modes.ai === "misconfigured") lines.push("The AI provider is not configured correctly. Analysis will fail until an administrator fixes it.");
  if (lines.length === 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50" data-testid="mode-banner">
      <div className="mx-auto max-w-7xl space-y-0.5 px-4 py-2 text-xs text-amber-900">
        {lines.map((l) => <p key={l}>{l}</p>)}
      </div>
    </div>
  );
}

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
      <ModeBanner modes={getRuntimeModes()} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
