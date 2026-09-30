import "server-only";

export interface RuntimeModes {
  /** "mock" records emails without delivering them. */
  email: "smtp" | "mock" | "misconfigured";
  /** "mock" is the offline rule-based analysis. */
  ai: "groq" | "mock" | "misconfigured";
}

/**
 * Which email and AI providers are active, read from the same settings the providers use,
 * so users are never led to believe a recorded email was delivered or an offline analysis is AI.
 */
export function getRuntimeModes(env: Record<string, string | undefined> = process.env): RuntimeModes {
  return {
    email: env.EMAIL_PROVIDER === "smtp" ? (env.SMTP_HOST ? "smtp" : "misconfigured") : "mock",
    ai: env.AI_PROVIDER === "groq" ? (env.GROQ_API_KEY ? "groq" : "misconfigured") : "mock",
  };
}
