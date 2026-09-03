"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createUserWithAdmin,
  deleteUserWithAdmin,
  updateUserWithAdmin,
  validateRole,
  type CreateUserInput,
  type UserActionResult,
} from "@/lib/auth/user-management-logic";

export async function createUserAction(formData: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const input = parseCreateInput(formData);
  if (typeof input === "string") return { error: input, success: null };

  const result = await createUserWithAdmin(createSupabaseAdminClient().auth.admin, input);
  if (result.success) revalidatePath("/users");
  return result;
}

export async function updateUserAction(formData: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const input = parseCreateInput(formData);
  if (typeof input === "string") return { error: input, success: null };

  const result = await updateUserWithAdmin(createSupabaseAdminClient().auth.admin, {
    ...input,
    userId,
  });
  if (result.success) revalidatePath("/users");
  return result;
}

export async function deleteUserAction(formData: FormData): Promise<UserActionResult> {
  const currentAdmin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const result = await deleteUserWithAdmin(
    createSupabaseAdminClient().auth.admin,
    currentAdmin.id,
    userId,
  );
  if (result.success) revalidatePath("/users");
  return result;
}

function parseCreateInput(formData: FormData): CreateUserInput | string {
  const role = validateRole(String(formData.get("role") ?? ""));
  if (!role) return "Select a valid role.";

  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role,
  };
}