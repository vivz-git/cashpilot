export const companyTypes = [
  "Marketing agency",
  "Creative studio",
  "Software agency",
  "Consultancy",
  "Other professional services",
  "Other",
] as const;

export const overdueRanges = [
  "Under $10k",
  "$10k – $50k",
  "$50k – $150k",
  "Over $150k",
  "Not sure",
] as const;

export type EarlyAccessRequest = {
  name: string;
  email: string;
  company: string;
  companyType: string;
  overdue: string;
  message: string;
};

export type FieldErrors = Partial<Record<keyof EarlyAccessRequest, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validate(data: EarlyAccessRequest): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.name.trim()) errors.name = "Enter your name.";
  if (!data.email.trim()) errors.email = "Enter your work email.";
  else if (!EMAIL_PATTERN.test(data.email.trim()))
    errors.email = "Enter a valid email address, like name@company.com.";
  if (!data.company.trim()) errors.company = "Enter your company name.";
  if (!companyTypes.includes(data.companyType as (typeof companyTypes)[number]))
    errors.companyType = "Choose the option that best describes your company.";
  if (!overdueRanges.includes(data.overdue as (typeof overdueRanges)[number]))
    errors.overdue = "Choose an approximate range. “Not sure” is fine.";
  if (data.message.length > 2000)
    errors.message = "Keep your message under 2,000 characters.";

  return errors;
}

export type SubmitResult = { delivery: "remote" } | { delivery: "local" };

const STORAGE_KEY = "cashpilot:early-access-requests";

/**
 * Submission placeholder.
 *
 * If NEXT_PUBLIC_EARLY_ACCESS_ENDPOINT is set, the request is POSTed there as
 * JSON. Otherwise nothing leaves the browser: the request is kept in
 * localStorage so the flow can be tested end to end, and the form tells the
 * visitor it was not sent.
 */
export async function submitEarlyAccess(
  data: EarlyAccessRequest,
): Promise<SubmitResult> {
  const endpoint = process.env.NEXT_PUBLIC_EARLY_ACCESS_ENDPOINT;
  const payload = { ...data, submittedAt: new Date().toISOString() };

  if (endpoint) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return { delivery: "remote" };
  }

  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const list = Array.isArray(existing) ? existing : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, payload]));
  } catch {
    // Storage can be unavailable (private browsing, blocked cookies).
    // The request is still acknowledged as not sent.
  }
  return { delivery: "local" };
}
