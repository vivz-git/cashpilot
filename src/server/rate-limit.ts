import { RateLimitError } from "./errors";

/**
 * In-memory fixed-window rate limiter. Suitable for a single server instance;
 * replace with a shared store before scaling horizontally (see DECISIONS.md D14).
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  import: { limit: 20, windowMs: 60 * 60_000 },
  ai: { limit: 60, windowMs: 60_000 },
  email: { limit: 30, windowMs: 60 * 60_000 },
} as const;

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): void {
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new RateLimitError();
  bucket.count += 1;
}

export function resetRateLimits(): void {
  store.clear();
}

// Prevent unbounded growth.
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }, 60_000);
  timer.unref?.();
}
