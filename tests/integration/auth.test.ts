import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { auditLogs, sessions } from "@/db/schema";
import { can } from "@/server/auth/context";
import { addTeamMember, login, logout, signup, validateSession } from "@/server/auth/service";
import { addUser, createOrg, PASSWORD, uniqueEmail } from "../support/factories";

describe("authentication", () => {
  it("signs up an owner in a new organization and logs in", async () => {
    const email = uniqueEmail();
    const user = await signup(getDb(), { organizationName: "Acme Agency", name: "Ada", email, password: PASSWORD });
    expect(user.role).toBe("owner");

    const { token } = await login(getDb(), { email: email.toUpperCase(), password: PASSWORD });
    const session = await validateSession(getDb(), token);
    expect(session?.ctx).toEqual({ userId: user.id, orgId: user.organizationId, role: "owner" });
    expect(session?.organization.name).toBe("Acme Agency");
  });

  it("stores only a hash of the session token", async () => {
    const owner = await createOrg();
    const { token } = await login(getDb(), { email: owner.email, password: PASSWORD });
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, owner.userId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.id !== token && r.id.length === 64)).toBe(true);
  });

  it("rejects wrong passwords and unknown emails with the same message", async () => {
    const owner = await createOrg();
    await expect(login(getDb(), { email: owner.email, password: "wrong password!" })).rejects.toThrow(
      "Invalid email or password.",
    );
    await expect(login(getDb(), { email: uniqueEmail(), password: PASSWORD })).rejects.toThrow(
      "Invalid email or password.",
    );
    const failures = await getDb().select().from(auditLogs).where(eq(auditLogs.userId, owner.userId));
    expect(failures.some((f) => f.action === "auth.login_failed")).toBe(true);
  });

  it("rejects duplicate emails, weak passwords and invalid emails", async () => {
    const owner = await createOrg();
    await expect(
      signup(getDb(), { organizationName: "X", name: "X", email: owner.email, password: PASSWORD }),
    ).rejects.toThrow("already exists");
    await expect(
      signup(getDb(), { organizationName: "X", name: "X", email: uniqueEmail(), password: "short" }),
    ).rejects.toThrow("at least 10");
    await expect(
      signup(getDb(), { organizationName: "X", name: "X", email: "nope", password: PASSWORD }),
    ).rejects.toThrow("valid email");
  });

  it("invalidates sessions on logout and ignores garbage or expired tokens", async () => {
    const owner = await createOrg();
    const { token } = await login(getDb(), { email: owner.email, password: PASSWORD });
    await logout(getDb(), token);
    expect(await validateSession(getDb(), token)).toBeNull();
    expect(await validateSession(getDb(), undefined)).toBeNull();
    expect(await validateSession(getDb(), "not-a-token")).toBeNull();

    const second = await login(getDb(), { email: owner.email, password: PASSWORD });
    await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, owner.userId));
    expect(await validateSession(getDb(), second.token)).toBeNull();
  });
});

describe("roles", () => {
  it("only owners can add teammates, and teammates join the owner's organization", async () => {
    const owner = await createOrg();
    const member = await addUser(owner, "member");
    expect(member.orgId).toBe(owner.orgId);
    await expect(
      addTeamMember(getDb(), member, { name: "X", email: uniqueEmail(), password: PASSWORD, role: "member" }),
    ).rejects.toThrow("permission");
  });

  it("cannot create another owner through the team form", async () => {
    const owner = await createOrg();
    await expect(
      addTeamMember(getDb(), owner, { name: "X", email: uniqueEmail(), password: PASSWORD, role: "owner" }),
    ).rejects.toThrow();
  });

  it("grants viewers read-only access", () => {
    const viewer = { userId: "u", orgId: "o", role: "viewer" as const };
    expect(can(viewer, "read")).toBe(true);
    expect(can(viewer, "write")).toBe(false);
    expect(can(viewer, "send_email")).toBe(false);
    expect(can(viewer, "manage_team")).toBe(false);
  });
});
