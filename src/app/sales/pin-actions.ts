"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requestPinChange,
  getMyPinChangeStatus,
  completePinChange,
  type MyPinChangeStatus,
} from "@/lib/auth/pin-change-service";
import { extractSessionId } from "@/lib/auth/pin-cookie";

export async function requestPinChangeAction(): Promise<{
  success: boolean;
  requestId?: string;
  status?: string;
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const role = user.app_metadata?.role;
  if (role !== "sales") {
    return { success: false, error: "Only sales representatives can request a Sales PIN change." };
  }

  const res = await requestPinChange(supabase);
  if (res.ok) {
    revalidatePath("/sales/settings");
    return { success: true, requestId: res.requestId, status: res.status };
  }

  return { success: false, error: res.error, status: res.status };
}

export async function getMyPinChangeStatusAction(): Promise<MyPinChangeStatus> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { has_request: false };
  }

  return getMyPinChangeStatus(supabase);
}

export async function completePinChangeAction(
  requestId: string,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sid = extractSessionId(user, session);

  const res = await completePinChange({
    requestId,
    newPin,
    supabaseClient: supabase,
    sessionContext: { uid: user.id, sid },
  });

  if (res.ok) {
    revalidatePath("/sales/settings");
    return { success: true };
  }

  return { success: false, error: res.error };
}