"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function submitLeadDisposition(
  leadId: string,
  disposition: string,
  dispositionDetails: string | null,
  nextFollowUp: string | null
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required." };
  }

  const isNotInterested = disposition === "Not Interested";
  const leadStatus = isNotInterested ? "closed" : "Assigned";

  let parsedDetails = null;
  if (dispositionDetails) {
    try {
      parsedDetails = JSON.parse(dispositionDetails);
    } catch {
      // ignore
    }
  }

  const { error } = await supabase
    .from("leads")
    .update({
      disposition,
      disposition_details: parsedDetails,
      next_follow_up: nextFollowUp || null,
      lead_status: leadStatus,
    })
    .eq("id", leadId);

  if (error) {
    console.error("Error submitting disposition:", error);
    return { error: "Could not submit disposition." };
  }

  return { error: null };
}

export async function fetchSalesReps(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createSupabaseAdminClient();
  
  const { data, error } = await adminClient.auth.admin.listUsers();
  
  if (error) {
    console.error("Error fetching sales reps:", error);
    return [];
  }

  return data.users
    .filter(u => u.app_metadata?.role === "sales" && u.id !== user.id)
    .map(u => ({
      id: u.id,
      name: u.user_metadata?.full_name || u.email || "Unknown Agent"
    }));
}

