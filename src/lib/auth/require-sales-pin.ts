import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPinCookieRaw, verifyPinToken, extractSessionId } from "./pin-cookie";

/**
 * Validates that a sales user has unlocked their session with a valid PIN.
 * 
 * Requirement: This function is a strict NO-OP (returns true) for non-sales roles
 * (admin, staff, manager).
 * 
 * For sales roles:
 * - Checks stateless token signature, uid, sid, and expiration
 * - Performs DB check against current pin_epoch to invalidate on resets/changes
 */
export async function requireSalesPin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return false;
  }

  const role = user.app_metadata?.role;
  // Non-sales roles (admin, staff, manager) are exempt
  if (role !== "sales") {
    return true;
  }

  const rawToken = await getPinCookieRaw();
  if (!rawToken) {
    return false;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sid = extractSessionId(user, sessionData?.session);

  const payload = await verifyPinToken(rawToken, { uid: user.id, sid });
  if (!payload) {
    return false;
  }

  // DB check for matching pin_epoch
  const { data: statusData, error: rpcError } = await supabase.rpc("sales_pin_status");
  if (rpcError || !statusData) {
    return false;
  }

  const { has_pin, pin_epoch } = statusData as {
    has_pin: boolean;
    pin_epoch: string | null;
    locked_until: string | null;
  };

  if (!has_pin || !pin_epoch) {
    return false;
  }

  if (payload.ep !== pin_epoch) {
    return false;
  }

  return true;
}
