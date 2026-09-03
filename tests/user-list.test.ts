import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  listAllAuthUsers,
  mapAuthUser,
  type ListUsers,
} from "../src/lib/auth/user-list";

const CREATED_AT = "2026-09-01T06:00:00.000Z";
const LAST_SIGN_IN_AT = "2026-09-02T06:00:00.000Z";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    email: "staff@example.com",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    last_sign_in_at: LAST_SIGN_IN_AT,
    ...overrides,
  };
}

describe("Auth user list", () => {
  it("retrieves all pages from the Admin API", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      makeUser({ id: `user-${index}` }),
    );
    const finalUser = makeUser({ id: "user-final" });
    const pages: number[] = [];
    const listUsers: ListUsers = vi.fn(async (params: Parameters<ListUsers>[0] = {}) => {
      const page = params.page ?? 1;
      pages.push(page);
      const users = page === 1 ? firstPage : page === 2 ? [finalUser] : [];
      return {
        data: {
          users,
          aud: "authenticated",
          nextPage: page < 2 ? 2 : null,
          lastPage: 2,
          total: 1001,
        },
        error: null,
      };
    });

    const users = await listAllAuthUsers(listUsers);

    expect(users).toHaveLength(1001);
    expect(users.at(-1)).toBe(finalUser);
    expect(pages).toEqual([1, 2]);
  });

  it("sanitizes Admin API errors", async () => {
    const listUsers: ListUsers = vi.fn(async () => {
      throw new Error("service-role-secret should not reach the user");
    });

    await expect(listAllAuthUsers(listUsers)).rejects.toThrow("Could not load users.");
    await expect(listAllAuthUsers(listUsers)).rejects.not.toThrow("service-role-secret");
  });

  it("maps the admin role and defaults missing or unknown roles to staff", () => {
    expect(mapAuthUser(makeUser({ app_metadata: { role: "admin" } })).role).toBe("Admin");
    expect(mapAuthUser(makeUser()).role).toBe("Staff");
    expect(mapAuthUser(makeUser({ app_metadata: { role: "owner" } })).role).toBe("Staff");
  });

  it("uses a dash when full_name is missing", () => {
    expect(mapAuthUser(makeUser()).name).toBe("—");
    expect(mapAuthUser(makeUser({ user_metadata: { full_name: "Asha Rao" } })).name).toBe("Asha Rao");
  });

  it("uses a dash when last sign-in is missing", () => {
    expect(mapAuthUser(makeUser({ last_sign_in_at: undefined })).lastSignIn).toBe("—");
    expect(mapAuthUser(makeUser()).lastSignIn).not.toBe("—");
  });
});