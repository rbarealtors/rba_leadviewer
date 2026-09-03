import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "staff";
export type AuthUser = Pick<User, "app_metadata">;

export function getAppRole(user: AuthUser | null): AppRole {
  return user?.app_metadata?.role === "admin" ? "admin" : "staff";
}

export function isAdmin(user: AuthUser | null): boolean {
  return getAppRole(user) === "admin";
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