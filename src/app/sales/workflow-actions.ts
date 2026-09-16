"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/leads/validate";
import { LeadStage, CrmDisposition, CANONICAL_DISPOSITIONS } from "@/lib/leads/types";


// ── Phase 1A: canonical CRM disposition mapping ─────────────────────────────

/**
 * Map a raw call-outcome string to the canonical CrmDisposition enum value.
 * The existing `disposition` column (raw string) is kept unchanged; this
 * derives the CRM-level label that goes into `crm_disposition`.
 */
function outcomeTocrm(
  outcome: "Connected" | "No Answer" | "Busy / Call Later" | "Wrong Number" | "Not Interested"
): CrmDisposition {
  switch (outcome) {
    case "Connected":          return "Contacted — Interested";
    case "No Answer":          return "Contacted — No Answer";
    case "Busy / Call Later":  return "Contacted — No Answer";
    case "Not Interested":     return "Contacted — Not Interested";
    case "Wrong Number":       return "Contacted — Not Interested";
  }
}


// Helper to check user session
async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}

export async function recordContactOutcomeAction(
  leadId: string,
  outcome: "Connected" | "No Answer" | "Busy / Call Later" | "Wrong Number" | "Not Interested",
  notes?: string,
  nextFollowUp?: string
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  // Fetch current lead state
  const { data: lead, error: fetchError } = await admin
    .from("leads")
    .select("lead_stage, assigned_to, rnr_streak")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) return { error: "Lead not found." };
  
  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized to update this lead." };
  }

  let newStage: LeadStage = lead.lead_stage;
  let newRnrStreak = lead.rnr_streak || 0;

  if (outcome === "Connected" || outcome === "Not Interested" || outcome === "Wrong Number") {
    if (newStage === "NEW") {
      newStage = "CONTACTED";
    }
    newRnrStreak = 0;
  } else if (outcome === "No Answer" || outcome === "Busy / Call Later") {
    // Stage remains unchanged
    newRnrStreak += 1;
  }

  // If wrong number or not interested, they might go to LOST, but user said keep LOST explicit. 
  // Let's just update the disposition if it's connected or keep stage same.
  // We'll update the lead using admin client since we revoked update access.

  const updates: any = {
    lead_stage: newStage,
    rnr_streak: newRnrStreak,
    disposition: outcome,
    disposition_details: notes ? { notes } : null,
    // Phase 1A: keep canonical CRM disposition in sync
    crm_disposition: outcomeTocrm(outcome),
  };

  if (nextFollowUp !== undefined) {
    updates.next_follow_up = nextFollowUp;
  }

  const { error: updateError } = await admin
    .from("leads")
    .update(updates)
    .eq("id", leadId);

  if (updateError) return { error: "Failed to update lead." };

  // Insert activity
  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "call_outcome",
    title: `Call Outcome: ${outcome}`,
    description: notes || null,
    details: { outcome, nextFollowUp, previous_stage: lead.lead_stage, new_stage: newStage }
  });

  revalidatePath("/sales");
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

export async function scheduleSiteVisitAction(
  leadId: string,
  visitData: {
    scheduled_at: string;
    property_name?: string;
    location?: string;
    notes?: string;
  }
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };
  if (!visitData.scheduled_at) return { error: "Scheduled date is required." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  const { data: lead } = await admin
    .from("leads")
    .select("lead_stage, assigned_to")
    .eq("id", leadId)
    .single();

  if (!lead) return { error: "Lead not found." };
  
  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized." };
  }

  // Get current visit count to set visit_number
  const { count } = await admin
    .from("site_visits")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId);

  const visitNumber = (count || 0) + 1;

  // Insert visit using user client or admin client. We'll use admin for consistency.
  const { data: visit, error: insertError } = await admin
    .from("site_visits")
    .insert({
      lead_id: leadId,
      assigned_to: lead.assigned_to,
      created_by: user.id,
      visit_number: visitNumber,
      scheduled_at: visitData.scheduled_at,
      status: "scheduled",
      property_name: visitData.property_name || null,
      location: visitData.location || null,
      notes: visitData.notes || null,
    })
    .select()
    .single();

  if (insertError) return { error: "Failed to schedule visit." };

  let newStage = lead.lead_stage;
  if (newStage === "NEW" || newStage === "CONTACTED") {
    newStage = "SITE_VISIT";
  }
  // Always sync crm_disposition to 'Site Visit Scheduled' when a visit is scheduled,
  // regardless of whether the stage already was SITE_VISIT (e.g. second visit).
  await admin
    .from("leads")
    .update({
      lead_stage: newStage,
      // Phase 1A: canonical disposition
      crm_disposition: "Site Visit Scheduled",
    })
    .eq("id", leadId);


  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "site_visit_scheduled",
    title: `Site Visit ${visitNumber} Scheduled`,
    description: `Scheduled for ${new Date(visitData.scheduled_at).toLocaleString()}`,
    details: { visit_id: visit.id, ...visitData }
  });

  revalidatePath("/sales");
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

export async function updateSiteVisitStatusAction(
  visitId: string,
  status: "completed" | "cancelled" | "rescheduled",
  outcomeNotes?: string,
  rescheduledDate?: string
): Promise<{ error: string | null }> {
  if (!isValidUuid(visitId)) return { error: "Invalid visit id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  const { data: visit } = await admin
    .from("site_visits")
    .select("*, lead:lead_id(assigned_to)")
    .eq("id", visitId)
    .single();

  if (!visit) return { error: "Visit not found." };
  
  if (user.app_metadata?.role === "sales" && visit.lead?.assigned_to !== user.id) {
    return { error: "Not authorized." };
  }

  if (status === "rescheduled" && !rescheduledDate) {
    return { error: "Rescheduled date is required." };
  }

  const updates: any = { status, outcome_notes: outcomeNotes || null };
  const now = new Date().toISOString();

  if (status === "completed") {
    updates.completed_at = now;
  } else if (status === "cancelled" || status === "rescheduled") {
    updates.cancelled_at = now;
    if (status === "cancelled") {
      updates.cancellation_reason = outcomeNotes || null;
    }
  }

  const { error: updateError } = await admin
    .from("site_visits")
    .update(updates)
    .eq("id", visitId);

  if (updateError) return { error: "Failed to update visit." };

  // Phase 1A: sync crm_disposition on the parent lead when a visit completes.
  // - completed  → Site Visit Done
  // - rescheduled → stays Site Visit Scheduled (a new visit row will be created)
  // - cancelled   → stays Site Visit Scheduled (unless no more visits remain, but
  //                  we don't override here; backfill handles initial state)
  if (status === "completed") {
    await admin
      .from("leads")
      .update({ crm_disposition: "Site Visit Done" })
      .eq("id", visit.lead_id);
  }


  await admin.from("lead_activities").insert({
    lead_id: visit.lead_id,
    user_id: user.id,
    type: status === "completed" ? "site_visit_completed" : status === "cancelled" ? "site_visit_cancelled" : "site_visit_rescheduled",
    title: `Site Visit ${visit.visit_number} ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    description: outcomeNotes || null,
    details: { visit_id: visitId, status, rescheduledDate }
  });

  if (status === "rescheduled" && rescheduledDate) {
    // Need to create a new visit linked to this one
    const { count } = await admin
      .from("site_visits")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", visit.lead_id);
      
    const visitNumber = (count || 0) + 1;

    const { data: newVisit } = await admin
      .from("site_visits")
      .insert({
        lead_id: visit.lead_id,
        assigned_to: visit.assigned_to,
        created_by: user.id,
        visit_number: visitNumber,
        scheduled_at: rescheduledDate,
        status: "scheduled",
        property_name: visit.property_name,
        location: visit.location,
        rescheduled_from_id: visit.id
      })
      .select()
      .single();

    if (newVisit) {
      await admin.from("lead_activities").insert({
        lead_id: visit.lead_id,
        user_id: user.id,
        type: "site_visit_scheduled",
        title: `Site Visit ${visitNumber} Scheduled (Rescheduled)`,
        description: `Rescheduled to ${new Date(rescheduledDate).toLocaleString()}`,
        details: { visit_id: newVisit.id, rescheduled_from: visit.id }
      });
    }
  }

  revalidatePath("/sales");
  revalidatePath(`/leads/${visit.lead_id}`);
  return { error: null };
}

export async function startBookingAction(
  leadId: string,
  unitDetails: string,
  notes?: string
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  const { data: lead } = await admin.from("leads").select("lead_stage, assigned_to").eq("id", leadId).single();
  if (!lead) return { error: "Lead not found." };
  
  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized." };
  }

  if (!unitDetails || unitDetails.trim() === "") {
    return { error: "Unit details are required." };
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({
      lead_stage: "BOOKING",
      booking_unit_details: unitDetails,
      // Phase 1A: BOOKING stage = visit completed and booking in progress.
      // Disposition stays 'Site Visit Done' until the token is received.
      crm_disposition: "Site Visit Done",
    })
    .eq("id", leadId);


  if (updateError) return { error: "Failed to start booking." };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "booking_started",
    title: "Booking Process Started",
    description: notes || null,
    details: { unit_details: unitDetails }
  });

  revalidatePath("/sales");
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

export async function recordTokenAndCloseAction(
  leadId: string,
  tokenData: {
    amount: number;
    payment_method: string;
    reference_number: string;
    received_at: string;
  }
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  const { data: lead } = await admin.from("leads").select("lead_stage, assigned_to").eq("id", leadId).single();
  if (!lead) return { error: "Lead not found." };
  
  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized." };
  }

  if (!tokenData.amount || tokenData.amount <= 0) {
    return { error: "Valid token amount is required." };
  }
  if (!tokenData.payment_method || tokenData.payment_method.trim() === "") {
    return { error: "Payment method is required." };
  }
  if (!tokenData.reference_number || tokenData.reference_number.trim() === "") {
    return { error: "Reference number is required." };
  }
  if (!tokenData.received_at) {
    return { error: "Receipt date is required." };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from("leads")
    .update({
      lead_stage: "CLOSED",
      lead_status: "closed",
      token_amount: tokenData.amount,
      token_payment_method: tokenData.payment_method,
      token_reference_number: tokenData.reference_number,
      token_received_at: tokenData.received_at,
      closed_at: now,
      // Phase 1A: token receipt is the definitive Closed — Won signal
      crm_disposition: "Closed — Won",
    })
    .eq("id", leadId);


  if (updateError) return { error: "Failed to close lead." };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "token_received",
    title: "Token Received",
    description: `Amount: ${tokenData.amount}`,
    details: tokenData
  });

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "lead_closed",
    title: "Lead Closed",
    description: "Lead successfully closed.",
    details: { closed_at: now }
  });

  revalidatePath("/sales");
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

export async function getLeadTimelineAction(leadId: string): Promise<{ data: any[] | null; error: string | null }> {
  if (!isValidUuid(leadId)) return { data: null, error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { data: null, error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  if (user.app_metadata?.role === "sales") {
    const { data: lead } = await admin.from("leads").select("assigned_to").eq("id", leadId).single();
    if (!lead || lead.assigned_to !== user.id) {
      return { data: null, error: "Not authorized." };
    }
  }

  const { data, error } = await admin
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: "Failed to fetch timeline." };

  return { data, error: null };
}

/**
 * Phase 1A: Manually update the canonical CRM disposition of a lead.
 * Does NOT overwrite legacy `disposition`, does NOT clear `next_follow_up`,
 * and does NOT manually update metadata/history (managed by DB trigger).
 */
export async function updateLeadDispositionAction(
  leadId: string,
  disposition: CrmDisposition
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  if (!CANONICAL_DISPOSITIONS.includes(disposition)) {
    return { error: "Invalid disposition value." };
  }

  const admin = createSupabaseAdminClient();

  const { data: lead, error: fetchError } = await admin
    .from("leads")
    .select("id, assigned_to, crm_disposition")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) return { error: "Lead not found." };

  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized to update this lead." };
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({
      crm_disposition: disposition,
    })
    .eq("id", leadId);

  if (updateError) return { error: "Failed to update disposition." };

  revalidatePath("/sales");
  revalidatePath("/sales/follow-ups");
  revalidatePath("/sales/pipeline");
  revalidatePath(`/sales/leads/${leadId}`);
  return { error: null };
}

/**
 * Phase 1A: Schedule, edit, or clear the canonical `next_follow_up` for a lead.
 * Setting `nextFollowUp` to null clears the follow-up.
 * Does NOT alter `crm_disposition` or legacy `disposition`.
 */
export async function updateLeadFollowUpAction(
  leadId: string,
  nextFollowUp: string | null
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) return { error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  if (nextFollowUp !== null) {
    const d = new Date(nextFollowUp);
    if (isNaN(d.getTime())) {
      return { error: "Invalid follow-up date." };
    }
  }

  const admin = createSupabaseAdminClient();

  const { data: lead, error: fetchError } = await admin
    .from("leads")
    .select("id, assigned_to")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) return { error: "Lead not found." };

  if (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id) {
    return { error: "Not authorized to update this lead." };
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({
      next_follow_up: nextFollowUp,
    })
    .eq("id", leadId);

  if (updateError) return { error: "Failed to update follow-up." };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "follow_up_scheduled",
    title: nextFollowUp ? "Follow-up Scheduled" : "Follow-up Cleared",
    description: nextFollowUp
      ? `Scheduled for ${new Date(nextFollowUp).toLocaleString("en-IN")}`
      : "Pending follow-up was cleared.",
    details: { nextFollowUp },
  });

  revalidatePath("/sales");
  revalidatePath("/sales/follow-ups");
  revalidatePath("/sales/pipeline");
  revalidatePath(`/sales/leads/${leadId}`);
  return { error: null };
}

/**
 * Phase 1A: Fetch disposition history from `lead_disposition_history`.
 * Enforces assignment isolation for sales reps.
 */
export async function getLeadDispositionHistoryAction(
  leadId: string
): Promise<{ data: any[] | null; error: string | null }> {
  if (!isValidUuid(leadId)) return { data: null, error: "Invalid lead id." };

  const user = await getUser();
  if (!user) return { data: null, error: "Not signed in." };

  const admin = createSupabaseAdminClient();

  if (user.app_metadata?.role === "sales") {
    const { data: lead } = await admin.from("leads").select("assigned_to").eq("id", leadId).single();
    if (!lead || lead.assigned_to !== user.id) {
      return { data: null, error: "Not authorized." };
    }
  }

  const { data, error } = await admin
    .from("lead_disposition_history")
    .select("*")
    .eq("lead_id", leadId)
    .order("changed_at", { ascending: false });

  if (error) return { data: null, error: "Failed to fetch disposition history." };

  return { data, error: null };
}


