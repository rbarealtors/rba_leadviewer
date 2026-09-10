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

