"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { addTeamMember, login, logout, signup } from "@/server/auth/service";
import {
  clearSessionCookie,
  clientIp,
  getSession,
  sessionToken,
  setSessionCookie,
} from "@/server/auth/session";
import { toUserMessage } from "@/server/errors";
import { checkRateLimit, LIMITS } from "@/server/rate-limit";
import { revalidatePath } from "next/cache";

export type FormState = { error?: string; success?: string } | undefined;

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  try {
    checkRateLimit(`signup:ip:${await clientIp()}`, LIMITS.signup);
    await signup(db, {
      organizationName: field(form, "organizationName"),
      name: field(form, "name"),
      email: field(form, "email"),
      password: field(form, "password"),
    });
    const { token, expiresAt } = await login(db, { email: field(form, "email"), password: field(form, "password") });
    await setSessionCookie(token, expiresAt);
  } catch (err) {
    return { error: toUserMessage(err) };
  }
  redirect("/dashboard");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  const email = field(form, "email").trim().toLowerCase();
  try {
    checkRateLimit(`login:ip:${await clientIp()}`, LIMITS.login);
    checkRateLimit(`login:email:${email}`, LIMITS.login);
    const { token, expiresAt } = await login(db, { email, password: field(form, "password") });
    await setSessionCookie(token, expiresAt);
  } catch (err) {
    return { error: toUserMessage(err) };
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await logout(getDb(), await sessionToken());
  await clearSessionCookie();
  redirect("/login");
}

export async function addTeamMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired. Please sign in again." };
  try {
    await addTeamMember(getDb(), session.ctx, {
      name: field(form, "name"),
      email: field(form, "email"),
      password: field(form, "password"),
      role: field(form, "role"),
    });
  } catch (err) {
    return { error: toUserMessage(err) };
  }
  revalidatePath("/team");
  return { success: "Teammate added. Share the initial password with them securely." };
}
