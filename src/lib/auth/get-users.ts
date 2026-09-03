import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllAuthUsers, mapAuthUsers, type ManagedUser } from "./user-list";

export async function getUsersForAdmin(): Promise<ManagedUser[]> {
  const admin = createSupabaseAdminClient();
  const users = await listAllAuthUsers((params) => admin.auth.admin.listUsers(params));
  return mapAuthUsers(users);
}