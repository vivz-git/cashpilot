import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding, for tables and lists that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200/80",
  red: "bg-red-50 text-red-700 ring-red-200/80",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/80",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  blue: "bg-brand-50 text-brand-700 ring-brand-200/80",
  violet: "bg-slate-900 text-white ring-slate-900",
} as const;

const DOTS = {
  gray: "bg-slate-400",
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-brand-500",
  violet: "bg-white",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "gray",
  children,
  title,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

export function priorityLevel(score: number): "high" | "medium" | "low" {
  return score >= 8 ? "high" : score >= 5 ? "medium" : "low";
}

/** AI priority 1–10. The number is always shown as text; colour only reinforces it. */
export function PriorityBadge({ score, showLevel = false }: { score: number | null; showLevel?: boolean }) {
  if (score === null) return <Badge title="Not analyzed yet">—</Badge>;
  const level = priorityLevel(score);
  const tone = level === "high" ? "red" : level === "medium" ? "amber" : "gray";
  return (
    <Badge tone={tone} title={`AI priority ${score} of 10 (${level}). 8–10 high, 5–7 medium, 1–4 low.`}>
      <span><span className="num">{score}</span>/10</span>
      {showLevel ? <span className="font-normal capitalize opacity-80">· {level}</span> : <span className="sr-only"> priority, {level}</span>}
    </Badge>
  );
}

export function EmptyState({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-lg bg-white text-slate-500 shadow-card ring-1 ring-slate-200/80">{icon}</div>}
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ALERT_STYLES = {
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "text-red-600", Icon: AlertIcon },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-600", Icon: CheckIcon },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "text-amber-600", Icon: AlertIcon },
  info: { box: "border-slate-200 bg-slate-50 text-slate-800", icon: "text-slate-500", Icon: InfoIcon },
} as const;

export function Alert({ tone, children }: { tone: "error" | "success" | "warning" | "info"; children: ReactNode }) {
  const s = ALERT_STYLES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${s.box}`}>
      <s.Icon className={`mt-0.5 size-4 ${s.icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Small uppercase-free label used above values and in definition lists. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-slate-500">{children}</p>;
}

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-xs transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/15 disabled:bg-slate-50 read-only:bg-slate-50";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-[background-color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0";

export const buttonClass = {
  primary: `${BUTTON_BASE} bg-brand-700 text-white shadow-sm hover:bg-brand-800`,
  secondary: `${BUTTON_BASE} bg-white text-slate-800 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50`,
  ghost: `${BUTTON_BASE} text-slate-600 hover:bg-slate-100 hover:text-ink`,
};

export const linkClass = "font-medium text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline";
