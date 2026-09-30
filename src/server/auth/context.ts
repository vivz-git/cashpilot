import type { Role } from "@/db/schema";
import { ForbiddenError } from "../errors";

/** Identity of the signed-in user. Every service function takes one. */
export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
}

export type Permission = "read" | "write" | "send_email" | "manage_team";

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ["read", "write", "send_email", "manage_team"],
  member: ["read", "write", "send_email"],
  viewer: ["read"],
};

export function can(ctx: AuthContext, permission: Permission): boolean {
  return GRANTS[ctx.role].includes(permission);
}

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new ForbiddenError();
}
