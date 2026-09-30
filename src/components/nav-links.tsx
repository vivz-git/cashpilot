"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p === "/dashboard" || p.startsWith("/invoices") },
  { href: "/import", label: "Import", match: (p: string) => p.startsWith("/import") },
  { href: "/team", label: "Team", match: (p: string) => p.startsWith("/team") },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
              active ? "bg-slate-100 text-ink" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
