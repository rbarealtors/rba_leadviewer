import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  getAppRole,
  isAdmin,
  requireAdminUser,
  type AuthUser,
} from "../src/lib/auth/authorization";

function userWithRole(role: string | undefined): AuthUser {
  return { app_metadata: role === undefined ? {} : { role } };
}

describe("application authorization", () => {
  it("recognizes an admin role", () => {
    const user = userWithRole("admin");

    expect(getAppRole(user)).toBe("admin");
    expect(isAdmin(user)).toBe(true);
    expect(requireAdminUser(user)).toBe(user);
  });

  it("does not recognize staff as admin", () => {
    const error = captureAuthorizationError(() => requireAdminUser(userWithRole("staff")));

    expect(isAdmin(userWithRole("staff"))).toBe(false);
    expect(error.status).toBe(403);
  });

  it("treats a missing role as staff", () => {
    const user = userWithRole(undefined);
    const error = captureAuthorizationError(() => requireAdminUser(user));

    expect(getAppRole(user)).toBe("staff");
    expect(error.status).toBe(403);
  });

  it("rejects unauthenticated access", () => {
    const error = captureAuthorizationError(() => requireAdminUser(null));

    expect(error.status).toBe(401);
  });

  it("rejects unknown roles as admin", () => {
    const user = userWithRole("owner");
    const error = captureAuthorizationError(() => requireAdminUser(user));

    expect(getAppRole(user)).toBe("staff");
    expect(isAdmin(user)).toBe(false);
    expect(error.status).toBe(403);
  });
});

function captureAuthorizationError(action: () => unknown): AuthorizationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthorizationError);
    return error as AuthorizationError;
  }

  throw new Error("Expected authorization to be rejected.");
}