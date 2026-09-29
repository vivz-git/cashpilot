import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Wordmark } from "@/components/brand";
import { InfoIcon } from "@/components/icons";
import { NavLinks } from "@/components/nav-links";
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
    <div className="border-b border-amber-200/80 bg-amber-50" data-testid="mode-banner">
      <div className="mx-auto flex max-w-7xl gap-2 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
        <InfoIcon className="mt-px size-3.5 text-amber-600" />
        <div className="space-y-0.5">
          {lines.map((l) => <p key={l}>{l}</p>)}
        </div>
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const initials = session.user.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-medium text-ink shadow-raised focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/dashboard" className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="CashPilot dashboard">
              <Wordmark />
            </Link>
            <div className="hidden sm:block">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="grid size-7 place-items-center rounded-md bg-slate-100 text-[0.6875rem] font-semibold text-slate-600" aria-hidden="true">
                {initials}
              </span>
              <span className="leading-tight" data-testid="current-user">
                <span className="block font-medium text-ink">{session.user.name}</span>
                <span className="block text-xs text-slate-500">
                  {session.organization.name}
                  {session.user.role === "viewer" && " · read-only"}
                </span>
              </span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                Sign out
              </button>
            </form>
          </div>
          <div className="w-full sm:hidden">
            <NavLinks />
          </div>
        </div>
      </header>
      <ModeBanner modes={getRuntimeModes()} />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
