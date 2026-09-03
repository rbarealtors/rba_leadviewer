import type { SupabaseClient, User } from "@supabase/supabase-js";
import { formatIST } from "@/lib/time";
import { getAppRole } from "./authorization";

const USERS_PER_PAGE = 1000;
const DASH = "—";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  roleValue: "admin" | "staff";
  created: string;
  lastSignIn: string;
};

export type ListUsers = SupabaseClient["auth"]["admin"]["listUsers"];

export async function listAllAuthUsers(listUsers: ListUsers): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; ; page += 1) {
    let result: Awaited<ReturnType<ListUsers>>;
    try {
      result = await listUsers({ page, perPage: USERS_PER_PAGE });
    } catch {
      throw new Error("Could not load users.");
    }

    if (result.error) {
      throw new Error("Could not load users.");
    }

    users.push(...result.data.users);
    if (result.data.users.length < USERS_PER_PAGE) {
      return users;
    }
  }
}

export function mapAuthUser(user: User): ManagedUser {
  const fullName = user.user_metadata?.full_name;
  const name = typeof fullName === "string" && fullName.trim() ? fullName : DASH;

  return {
    id: user.id,
    name,
    email: user.email ?? DASH,
    role: getAppRole(user) === "admin" ? "Admin" : "Staff",
    roleValue: getAppRole(user),
    created: formatIST(user.created_at),
    lastSignIn: user.last_sign_in_at ? formatIST(user.last_sign_in_at) : DASH,
  };
}

export function mapAuthUsers(users: User[]): ManagedUser[] {
  return users.map(mapAuthUser);
}