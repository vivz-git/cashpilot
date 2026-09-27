import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { organizations, sessions, users, type Role, type User } from "@/db/schema";
import { isValidEmail, normalizeEmail } from "@/lib/email-address";
import { audit } from "../audit";
import { AppError } from "../errors";
import { requirePermission, type AuthContext } from "./context";

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = process.env.NODE_ENV === "test" ? 4 : 12;
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("cashpilot-dummy-password", BCRYPT_COST);

const email = z
  .string()
  .trim()
  .max(254)
  .transform(normalizeEmail)
  .refine(isValidEmail, "Enter a valid email address.");
const password = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.");
const name = z.string().trim().min(1, "Name is required.").max(100);

export const signupSchema = z.object({
  organizationName: z.string().trim().min(1, "Organization name is required.").max(120),
  name,
  email,
  password,
});

export const loginSchema = z.object({
  email: z.string().trim().max(254).transform(normalizeEmail),
  password: z.string().min(1, "Password is required.").max(200),
});

export const addMemberSchema = z.object({
  name,
  email,
  password,
  role: z.enum(["member", "viewer"]),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}

async function emailTaken(db: Database, addr: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${addr}`)
    .limit(1);
  return rows.length > 0;
}

export async function signup(db: Database, input: unknown): Promise<User> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new AppError(firstIssue(parsed.error));
  const { organizationName, name, email, password } = parsed.data;

  if (await emailTaken(db, email)) {
    throw new AppError("An account with this email already exists.", "conflict");
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: organizationName }).returning();
    const [user] = await tx
      .insert(users)
      .values({ organizationId: org!.id, email, name, passwordHash, role: "owner" })
      .returning();
    await audit(tx, { orgId: org!.id, userId: user!.id, action: "auth.signup" });
    return user!;
  });
}

/** Returns the raw session token on success; throws a generic error otherwise. */
export async function login(
  db: Database,
  input: unknown,
): Promise<{ token: string; user: User; expiresAt: Date }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AppError("Invalid email or password.", "unauthenticated");
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) await audit(db, { orgId: user.organizationId, userId: user.id, action: "auth.login_failed" });
    throw new AppError("Invalid email or password.", "unauthenticated");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId: user.id, expiresAt });
  await audit(db, { orgId: user.organizationId, userId: user.id, action: "auth.login" });
  return { token, user, expiresAt };
}

export interface SessionUser {
  ctx: AuthContext;
  user: { id: string; name: string; email: string; role: Role };
  organization: { id: string; name: string };
}

export async function validateSession(db: Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ user: users, org: organizations })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ctx: { userId: row.user.id, orgId: row.user.organizationId, role: row.user.role },
    user: { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role },
    organization: { id: row.org.id, name: row.org.name },
  };
}

export async function logout(db: Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function listTeam(db: Database, ctx: AuthContext) {
  requirePermission(ctx, "read");
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, ctx.orgId))
    .orderBy(users.createdAt);
}

/** Owners add teammates to their own organization with an initial password. */
export async function addTeamMember(db: Database, ctx: AuthContext, input: unknown): Promise<User> {
  requirePermission(ctx, "manage_team");
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) throw new AppError(firstIssue(parsed.error));
  const { name, email, password, role } = parsed.data;
  if (await emailTaken(db, email)) {
    throw new AppError("An account with this email already exists.", "conflict");
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const [user] = await db
    .insert(users)
    .values({ organizationId: ctx.orgId, email, name, passwordHash, role })
    .returning();
  await audit(db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "team.member_added",
    targetType: "user",
    targetId: user!.id,
    metadata: { role },
  });
  return user!;
}
