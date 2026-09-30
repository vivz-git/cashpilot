import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { ClockIcon, LayersIcon, ShieldCheckIcon } from "@/components/icons";
import { getSession } from "@/server/auth/session";

const POINTS = [
  { Icon: LayersIcon, title: "See what needs attention", body: "Overdue invoices ranked by priority, with the likely reason each one is unpaid." },
  { Icon: ShieldCheckIcon, title: "You approve every email", body: "Polite, plain-text reminders. Nothing is sent until you click Approve & Send." },
  { Icon: ClockIcon, title: "Keep the full history", body: "Promises, disputes and payments recorded on one timeline per invoice." },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden border-r border-slate-200/80 bg-white px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <Wordmark />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
            Get paid on time without sounding like a debt collector.
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <Icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400">Accounts receivable follow-up for small agencies.</p>
      </aside>
      <main className="flex items-start justify-center px-4 py-12 sm:items-center sm:py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
            <p className="mt-3 text-sm text-slate-600">
              Follow up on overdue invoices with polite reminders you review and approve before anything is sent.
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
