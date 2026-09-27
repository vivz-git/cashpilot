/** Number of minor-unit digits for an ISO-4217 currency (e.g. USD → 2, JPY → 0). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

const supported = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [],
);

export function isSupportedCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && supported.has(code);
}

/**
 * Parse a user-supplied decimal amount into integer minor units.
 * Accepts "1234.50", "1,234.50" and a leading currency symbol is NOT accepted
 * (currency comes from its own column). Returns null when invalid.
 */
export function parseAmountToMinor(raw: string, currency: string): number | null {
  const cleaned = raw.trim().replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const exp = currencyExponent(currency);
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > exp) return null;
  const minor = Number(whole) * 10 ** exp + Number(frac.padEnd(exp, "0") || "0");
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amountMinor / 10 ** exp,
  );
}
