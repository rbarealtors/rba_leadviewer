import { describe, expect, it, vi } from "vitest";
import { AuthError, type User } from "@supabase/supabase-js";
import {
  buildCreateAttributes,
  buildUpdateAttributes,
  createUserWithAdmin,
  deleteUserWithAdmin,
  updateUserWithAdmin,
  validateRole,
  type CreateUserInput,
  type UserAdminApi,
} from "../src/lib/auth/user-management-logic";

function makeUser(id: string, role: "admin" | "staff"): User {
  return {
    id,
    app_metadata: { role },
    user_metadata: { full_name: `User ${id}` },
    aud: "authenticated",
    email: `${id}@example.com`,
    created_at: "2026-09-01T06:00:00.000Z",
    updated_at: "2026-09-01T06:00:00.000Z",
  };
}

function successfulAdmin(): UserAdminApi {
  return {
    createUser: vi.fn(async () => ({ data: { user: makeUser("created", "staff") }, error: null })),
    updateUserById: vi.fn(async () => ({ data: { user: makeUser("updated", "staff") }, error: null })),
    deleteUser: vi.fn(async () => ({ data: { user: makeUser("deleted", "staff") }, error: null })),
    listUsers: vi.fn(async () => ({
      data: { users: [], aud: "authenticated", nextPage: null, lastPage: 1, total: 0 },
      error: null,
    })),
  };
}

const validInput: CreateUserInput = {
  name: "Asha Rao",
  email: "asha@example.com",
  password: "strong-password",
  role: "staff",
};

describe("user management mutations", () => {
  it.each(["staff", "admin"] as const)("creates a valid %s user with fixed metadata", async (role) => {
    const admin = successfulAdmin();
    const input = { ...validInput, role };

    const result = await createUserWithAdmin(admin, input);

    expect(result.error).toBeNull();
    expect(admin.createUser).toHaveBeenCalledWith(buildCreateAttributes(input));
  });

  it("rejects invalid email, missing name, and invalid role before the API", async () => {
    const admin = successfulAdmin();

    expect((await createUserWithAdmin(admin, { ...validInput, email: "bad" })).error).toBe("Enter a valid email address.");
    expect((await createUserWithAdmin(admin, { ...validInput, name: " " })).error).toBe("Name is required.");
    expect(validateRole("owner")).toBeNull();
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("handles duplicate email errors safely", async () => {
    const admin = successfulAdmin();
    admin.createUser = vi.fn(async () => ({
      data: { user: null },
      error: new AuthError("private service details", 422, "email_exists"),
    }));

    const result = await createUserWithAdmin(admin, validInput);

    expect(result.error).toBe("A user with this email already exists.");
    expect(result.error).not.toContain("private service details");
  });

  it("updates name, email, role, and password", async () => {
    const admin = successfulAdmin();
    const input = { ...validInput, role: "admin" as const, userId: "staff-1" };
    const users = [makeUser("staff-1", "staff"), makeUser("admin-1", "admin")];

    const result = await updateUserWithAdmin(admin, input, users);

    expect(result.error).toBeNull();
    expect(admin.updateUserById).toHaveBeenCalledWith(input.userId, buildUpdateAttributes(input));
  });

  it("leaves the password unchanged when edit password is empty", () => {
    const input = { ...validInput, password: "", userId: "staff-1" };

    expect(buildUpdateAttributes(input)).not.toHaveProperty("password");
  });

  it("allows deleting another user", async () => {
    const admin = successfulAdmin();
    const result = await deleteUserWithAdmin(
      admin,
      "admin-1",
      "staff-1",
      [makeUser("admin-1", "admin"), makeUser("admin-2", "admin"), makeUser("staff-1", "staff")],
    );

    expect(result.error).toBeNull();
    expect(admin.deleteUser).toHaveBeenCalledWith("staff-1");
  });

  it("blocks self-delete and deleting the final admin", async () => {
    const admin = successfulAdmin();
    const selfDelete = await deleteUserWithAdmin(admin, "admin-1", "admin-1", [makeUser("admin-1", "admin")]);
    const finalAdminDelete = await deleteUserWithAdmin(admin, "operator", "admin-1", [makeUser("admin-1", "admin")]);

    expect(selfDelete.error).toBe("You cannot delete your own account.");
    expect(finalAdminDelete.error).toBe("At least one administrator must remain.");
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("blocks demoting the final admin but allows demoting with another admin", async () => {
    const admin = successfulAdmin();
    const input = { ...validInput, role: "staff" as const, userId: "admin-1" };
    const finalAdmin = await updateUserWithAdmin(admin, input, [makeUser("admin-1", "admin")]);
    const remainingAdmin = await updateUserWithAdmin(admin, input, [makeUser("admin-1", "admin"), makeUser("admin-2", "admin")]);

    expect(finalAdmin.error).toBe("At least one administrator must remain.");
    expect(remainingAdmin.error).toBeNull();
    expect(admin.updateUserById).toHaveBeenCalledTimes(1);
  });
});