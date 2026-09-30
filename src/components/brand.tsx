/** CashPilot mark: a heading line rising inside a rounded square. Matches src/app/icon.svg. */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-brand-700" />
      <path d="M9 21.5l5-5 3.5 3.5L23.5 12" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 12h4.5v4.5" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">CashPilot</span>
    </span>
  );
}
