import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { validateSession, type SessionUser } from "./service";

export const SESSION_COOKIE = "cp_session";

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" && !(process.env.APP_URL ?? "").startsWith("http://");
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  return validateSession(getDb(), await sessionToken());
});

/** For pages: redirects to /login when not signed in. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Best-effort client IP for rate limiting (trusts the first proxy hop). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
