import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import type { Role } from "@/db/schema";
import type { AuthContext } from "@/server/auth/context";
import { addTeamMember, signup } from "@/server/auth/service";

export const PASSWORD = "correct horse battery";

export function uniqueEmail(prefix = "user") {
  return `${prefix}-${randomUUID().slice(0, 8)}@agency.example`;
}

/** Creates a new organization with an owner and returns the owner's context. */
export async function createOrg(name = "Test Agency"): Promise<AuthContext & { email: string }> {
  const email = uniqueEmail("owner");
  const user = await signup(getDb(), { organizationName: name, name: "Olivia Owner", email, password: PASSWORD });
  return { userId: user.id, orgId: user.organizationId, role: "owner", email };
}

export async function addUser(owner: AuthContext, role: Exclude<Role, "owner">): Promise<AuthContext> {
  const user = await addTeamMember(getDb(), owner, {
    name: `${role} user`,
    email: uniqueEmail(role),
    password: PASSWORD,
    role,
  });
  return { userId: user.id, orgId: user.organizationId, role };
}

