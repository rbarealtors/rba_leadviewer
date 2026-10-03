import type { User } from "@supabase/supabase-js";

export const VALID_ROLES = ["admin", "staff", "sales"] as const;
export type AppRole = (typeof VALID_ROLES)[number];
export type AuthUser = Pick<User, "app_metadata">;

export function getAppRole(user: AuthUser | null): AppRole {
  const role = user?.app_metadata?.role;
  return role === "admin" ? "admin" : role === "sales" ? "sales" : "staff";
}

export function isAdmin(user: AuthUser | null): boolean {
  return getAppRole(user) === "admin";
}

export function isStaffOrAdmin(user: AuthUser | null): boolean {
  const role = getAppRole(user);
  return role === "admin" || role === "staff";
}

export function canManageBrochures(user: AuthUser | null): boolean {
  return isStaffOrAdmin(user);
}

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required." : "Administrator access required.");
    this.name = "AuthorizationError";
  }
}

export function requireAdminUser<T extends AuthUser>(user: T | null): T {
  if (!user) {
    throw new AuthorizationError(401);
  }

  if (!isAdmin(user)) {
    throw new AuthorizationError(403);
  }

  return user;
}

export function requireManagementUser<T extends AuthUser>(user: T | null): T {
  if (!user) {
    throw new AuthorizationError(401);
  }

  if (!isStaffOrAdmin(user)) {
    throw new AuthorizationError(403);
  }

  return user;
}
