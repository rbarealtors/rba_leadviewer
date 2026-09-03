import type {
  AdminUserAttributes,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import { listAllAuthUsers } from "./user-list";
import { getAppRole, type AppRole } from "./authorization";

export const MIN_PASSWORD_LENGTH = 8;

export type UserActionResult = {
  error: string | null;
  success: string | null;
};

export type UserAdminApi = Pick<
  SupabaseClient["auth"]["admin"],
  "createUser" | "updateUserById" | "deleteUser" | "listUsers"
>;

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: AppRole;
};

export type UpdateUserInput = CreateUserInput & { userId: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUserInput(input: CreateUserInput, passwordRequired = true): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!EMAIL_PATTERN.test(input.email.trim())) return "Enter a valid email address.";
  if (passwordRequired && input.password.length < MIN_PASSWORD_LENGTH) {
    return "Password must be at least 8 characters.";
  }
  if (!passwordRequired && input.password && input.password.length < MIN_PASSWORD_LENGTH) {
    return "Password must be at least 8 characters.";
  }
  if (input.role !== "admin" && input.role !== "staff") return "Select a valid role.";
  return null;
}

export function validateRole(value: string): AppRole | null {
  return value === "admin" || value === "staff" ? value : null;
}

export function buildCreateAttributes(input: CreateUserInput): AdminUserAttributes {
  return {
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.name.trim() },
    app_metadata: { role: input.role },
  };
}

export function buildUpdateAttributes(input: UpdateUserInput): AdminUserAttributes {
  const attributes: AdminUserAttributes = {
    email: input.email.trim(),
    email_confirm: true,
    user_metadata: { full_name: input.name.trim() },
    app_metadata: { role: input.role },
  };

  if (input.password) attributes.password = input.password;
  return attributes;
}

export function countAdmins(users: User[]): number {
  return users.filter((user) => getAppRole(user) === "admin").length;
}

export function canRemoveAdmin(users: User[], target: User): boolean {
  return getAppRole(target) !== "admin" || countAdmins(users) > 1;
}

export async function createUserWithAdmin(
  admin: UserAdminApi,
  input: CreateUserInput,
): Promise<UserActionResult> {
  const validationError = validateUserInput(input, false);
  if (validationError) return failure(validationError);

  try {
    const { error } = await admin.createUser(buildCreateAttributes(input));
    if (error) return failure(safeApiError(error, "create"));
    return success("User created successfully.");
  } catch {
    return failure("Unable to create user. Please try again.");
  }
}

export async function updateUserWithAdmin(
  admin: UserAdminApi,
  input: UpdateUserInput,
  existingUsers?: User[],
): Promise<UserActionResult> {
  const validationError = validateUserInput(input);
  if (validationError) return failure(validationError);

  try {
    const users = existingUsers ?? (await listAllAuthUsers((params) => admin.listUsers(params)));
    const target = users.find((user) => user.id === input.userId);
    if (!target) return failure("Unable to update user. Please try again.");

    if (getAppRole(target) === "admin" && input.role === "staff" && countAdmins(users) <= 1) {
      return failure("At least one administrator must remain.");
    }

    const { error } = await admin.updateUserById(input.userId, buildUpdateAttributes(input));
    if (error) return failure(safeApiError(error, "update"));
    return success("User updated successfully.");
  } catch {
    return failure("Unable to update user. Please try again.");
  }
}

export async function deleteUserWithAdmin(
  admin: UserAdminApi,
  currentAdminId: string,
  userId: string,
  existingUsers?: User[],
): Promise<UserActionResult> {
  if (!userId || userId === currentAdminId) return failure("You cannot delete your own account.");

  try {
    const users = existingUsers ?? (await listAllAuthUsers((params) => admin.listUsers(params)));
    const target = users.find((user) => user.id === userId);
    if (!target) return failure("Unable to delete user. Please try again.");
    if (!canRemoveAdmin(users, target)) return failure("At least one administrator must remain.");

    const { error } = await admin.deleteUser(userId);
    if (error) return failure(safeApiError(error, "delete"));
    return success("User deleted successfully.");
  } catch {
    return failure("Unable to delete user. Please try again.");
  }
}

function success(message: string): UserActionResult {
  return { error: null, success: message };
}

function failure(message: string): UserActionResult {
  return { error: message, success: null };
}

function safeApiError(error: unknown, operation: "create" | "update" | "delete"): string {
  const details = error && typeof error === "object" ? error : null;
  const code = details && "code" in details ? String(details.code) : "";
  const message = details && "message" in details ? String(details.message).toLowerCase() : "";

  if (code === "email_exists" || message.includes("already registered") || message.includes("already exists")) {
    return "A user with this email already exists.";
  }
  if (code === "invalid_email" || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (code === "weak_password" || message.includes("password")) {
    return "Password does not meet the minimum requirements.";
  }
  return `Unable to ${operation} user. Please try again.`;
}