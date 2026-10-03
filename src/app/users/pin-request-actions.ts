"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/authorization";
import {
  verifyAdminPasswordAndApprove,
  adminRejectPinChange,
  listPinChangeRequests,
  type PinChangeRequestRow,
} from "@/lib/auth/pin-change-service";
import { createClient } from "@supabase/supabase-js";

function getEphemeralAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function approvePinRequestAction(
  requestId: string,
  adminPassword: string
): Promise<{ success: boolean; expiresAt?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = requireAdminUser(user);

  if (!admin.email) {
    return { success: false, error: "Admin email not found." };
  }

  const ephemeralClient = getEphemeralAuthClient();
  const result = await verifyAdminPasswordAndApprove({
    currentAdminId: admin.id,
    currentAdminEmail: admin.email,
    currentAdminRole: admin.app_metadata?.role || "admin",
    adminPassword,
    requestId,
    supabaseClient: supabase,
    ephemeralAuthClient: ephemeralClient,
  });

  if (result.ok) {
    revalidatePath("/users");
    return { success: true, expiresAt: result.expiresAt };
  }

  return { success: false, error: result.error };
}

export async function rejectPinRequestAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  requireAdminUser(user);

  const result = await adminRejectPinChange({
    requestId,
    supabaseClient: supabase,
  });

  if (result.ok) {
    revalidatePath("/users");
    return { success: true };
  }

  return { success: false, error: result.error };
}

export async function listPinChangeRequestsAction(): Promise<PinChangeRequestRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  requireAdminUser(user);

  return listPinChangeRequests(supabase);
}