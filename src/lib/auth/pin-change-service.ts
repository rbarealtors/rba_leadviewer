import type { SupabaseClient } from "@supabase/supabase-js";
import { issuePinCookie } from "./pin-cookie";

export const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "4321", "3210", "9876", "8765",
  "7654", "6543", "5432", "1212", "1313", "1010", "6969", "2580", "0852",
  "123456", "654321", "000000", "111111", "222222", "333333", "444444", "555555",
  "666666", "777777", "888888", "999999",
]);

export function validatePinFormat(pin: string): { valid: boolean; reason?: string } {
  if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
    return { valid: false, reason: "PIN must be between 4 and 6 digits." };
  }
  if (WEAK_PINS.has(pin)) {
    return { valid: false, reason: "PIN is too simple or common. Choose a different PIN." };
  }
  return { valid: true };
}

export interface PinChangeRequestRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "COMPLETED";
  created_at: string;
  approved_at: string | null;
  expires_at: string | null;
}

export interface MyPinChangeStatus {
  has_request: boolean;
  id?: string;
  status?: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "COMPLETED";
  created_at?: string;
  approved_at?: string | null;
  expires_at?: string | null;
}

export async function requestPinChange(supabase: SupabaseClient): Promise<{
  ok: boolean;
  requestId?: string;
  status?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("request_sales_pin_change");
  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as {
    status: string;
    request_id?: string;
    request_status?: string;
  };

  if (result.status === "ok") {
    return { ok: true, requestId: result.request_id, status: "REQUESTED" };
  }

  if (result.status === "already_active") {
    return {
      ok: false,
      requestId: result.request_id,
      status: result.request_status,
      error: `You already have an active PIN change request (${result.request_status}).`,
    };
  }

  return { ok: false, error: "Failed to create PIN change request." };
}

export async function getMyPinChangeStatus(supabase: SupabaseClient): Promise<MyPinChangeStatus> {
  const { data, error } = await supabase.rpc("get_my_pin_change_status");
  if (error || !data) {
    return { has_request: false };
  }

  return data as MyPinChangeStatus;
}

export async function verifyAdminPasswordAndApprove({
  currentAdminId,
  currentAdminEmail,
  currentAdminRole,
  adminPassword,
  requestId,
  supabaseClient,
  ephemeralAuthClient,
  serviceRoleClient,
}: {
  currentAdminId: string;
  currentAdminEmail: string;
  currentAdminRole: string;
  adminPassword: string;
  requestId: string;
  supabaseClient: SupabaseClient;
  ephemeralAuthClient: SupabaseClient;
  serviceRoleClient?: SupabaseClient;
}): Promise<{ ok: boolean; expiresAt?: string; error?: string }> {
  // 1. Verify current admin role from caller
  if (currentAdminRole !== "admin") {
    return { ok: false, error: "Administrator access required." };
  }

  if (!currentAdminId) {
    return { ok: false, error: "Current admin ID is required." };
  }

  if (!adminPassword || typeof adminPassword !== "string") {
    return { ok: false, error: "Admin password is required." };
  }

  if (!requestId) {
    return { ok: false, error: "Request ID is required." };
  }

  // 2. Re-authenticate admin with ephemeral client
  const { data: authData, error: authError } = await ephemeralAuthClient.auth.signInWithPassword({
    email: currentAdminEmail,
    password: adminPassword,
  });

  if (authError || !authData?.user) {
    return { ok: false, error: "Incorrect admin password." };
  }

  // 3. Explicitly verify re-authenticated identity matches the current logged-in admin user ID
  if (authData.user.id !== currentAdminId) {
    return {
      ok: false,
      error: "Re-authenticated identity does not match current admin session.",
    };
  }

  // 4. Generate cryptographically random 32-byte authorization token
  const rawTokenBytes = new Uint8Array(32);
  crypto.getRandomValues(rawTokenBytes);
  const rawToken = Array.from(rawTokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // 5. If serviceRoleClient is provided, create the database reauth grant proof
  if (serviceRoleClient) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    const { data: grantResult, error: grantError } = await serviceRoleClient.rpc(
      "create_admin_reauth_grant",
      {
        target_admin_id: currentAdminId,
        target_request_id: requestId,
        token_hash: tokenHash,
        grant_purpose: "approve_sales_pin_change",
      }
    );

    if (grantError || (grantResult as { status?: string })?.status !== "ok") {
      return { ok: false, error: "Failed to establish authorization grant." };
    }
  }

  // 6. Call RPC to approve request with verified token proof
  const { data, error: rpcError } = await supabaseClient.rpc("admin_approve_sales_pin_change", {
    target_request_id: requestId,
    reauth_token: rawToken,
  });

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const result = data as {
    status: string;
    request_id?: string;
    expires_at?: string;
  };

  if (result.status === "ok") {
    return { ok: true, expiresAt: result.expires_at };
  }

  if (result.status === "cannot_approve_own") {
    return { ok: false, error: "Admins cannot approve their own PIN change requests." };
  }

  if (result.status === "invalid_state") {
    return { ok: false, error: "This request is no longer pending approval." };
  }

  if (result.status === "invalid_grant" || result.status === "reauth_required") {
    return { ok: false, error: "Authorization grant invalid or expired. Please re-authenticate." };
  }

  if (result.status === "not_found") {
    return { ok: false, error: "PIN change request not found." };
  }

  return { ok: false, error: "Failed to approve request." };
}

export async function adminRejectPinChange({
  requestId,
  supabaseClient,
}: {
  requestId: string;
  supabaseClient: SupabaseClient;
}): Promise<{ ok: boolean; error?: string }> {
  if (!requestId) {
    return { ok: false, error: "Request ID is required." };
  }

  const { data, error: rpcError } = await supabaseClient.rpc("admin_reject_sales_pin_change", {
    target_request_id: requestId,
  });

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const result = data as { status: string };

  if (result.status === "ok") {
    return { ok: true };
  }

  if (result.status === "invalid_state") {
    return { ok: false, error: "This request is no longer pending." };
  }

  return { ok: false, error: "Failed to reject request." };
}

export async function completePinChange({
  requestId,
  newPin,
  supabaseClient,
  sessionContext,
}: {
  requestId: string;
  newPin: string;
  supabaseClient: SupabaseClient;
  sessionContext?: { uid: string; sid: string };
}): Promise<{ ok: boolean; pinEpoch?: string; error?: string }> {
  const formatValidation = validatePinFormat(newPin);
  if (!formatValidation.valid) {
    return { ok: false, error: formatValidation.reason };
  }

  const { data, error: rpcError } = await supabaseClient.rpc("complete_sales_pin_change", {
    target_request_id: requestId,
    new_pin: newPin,
  });

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const result = data as { status: string; pin_epoch?: string };

  if (result.status === "ok" && result.pin_epoch) {
    // Issue a fresh PIN cookie for the current session with the new epoch
    if (sessionContext) {
      await issuePinCookie(sessionContext.uid, sessionContext.sid, result.pin_epoch);
    }
    return { ok: true, pinEpoch: result.pin_epoch };
  }

  switch (result.status) {
    case "weak":
      return { ok: false, error: "PIN is too simple or common. Choose a different PIN." };
    case "invalid_format":
      return { ok: false, error: "PIN must be between 4 and 6 digits." };
    case "expired":
      return { ok: false, error: "Approval expired (15-minute window passed). Please request a new PIN change." };
    case "not_approved":
      return { ok: false, error: "This request has not been approved by an admin." };
    case "not_found":
      return { ok: false, error: "PIN change request not found or not owned by you." };
    default:
      return { ok: false, error: "Failed to update PIN." };
  }
}

export async function listPinChangeRequests(
  supabaseClient: SupabaseClient
): Promise<PinChangeRequestRow[]> {
  const { data, error } = await supabaseClient.rpc("admin_list_pin_change_requests");
  if (error || !data) {
    return [];
  }
  return data as PinChangeRequestRow[];
}