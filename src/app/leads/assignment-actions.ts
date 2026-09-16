"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/leads/validate";
import { listAllAuthUsers } from "@/lib/auth/user-list";

export type SalesRep = {
  id: string;
  full_name: string;
  email: string;
};

export async function getSalesTeam(): Promise<{ data: SalesRep[] | null; error: string | null }> {
  try {
    const admin = createSupabaseAdminClient();
    const users = await listAllAuthUsers((params) => admin.auth.admin.listUsers(params));
    
    const reps = users.map((u) => ({
      id: u.id,
      full_name: (u.user_metadata?.full_name as string) || "—",
      email: u.email || "—",
    }));

    reps.sort((a, b) => a.full_name.localeCompare(b.full_name));

    return { data: reps, error: null };
  } catch {
    return { data: null, error: "Failed to load sales team." };
  }
}

export async function assignLead(
  leadId: string,
  userId: string | null
): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) {
    return { error: "Invalid lead id." };
  }

  if (userId !== null && !isValidUuid(userId)) {
    return { error: "Invalid user id." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  if (user.app_metadata?.role === "sales") {
    return { error: "Only staff or administrators can assign leads." };
  }

  const admin = createSupabaseAdminClient();

  const { data: lead } = await admin.from("leads").select("assigned_to").eq("id", leadId).single();

  const { error } = await admin
    .from("leads")
    .update({
      assigned_to: userId,
      assigned_at: userId ? new Date().toISOString() : null,
      lead_status: userId ? "Assigned" : null,
    })
    .eq("id", leadId);

  if (error) {
    return { error: "Could not assign lead." };
  }

  if (userId) {
    await admin.from("lead_assignments").insert({
      lead_id: leadId,
      assigned_by: user.id,
      assigned_to: userId,
      previous_assigned_to: lead?.assigned_to || null,
      reason: "Manual assignment"
    });

    await admin.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      type: "lead_assigned",
      title: "Lead Assigned",
      description: "Lead was manually assigned.",
      details: { assigned_to: userId, previous_assigned_to: lead?.assigned_to }
    });

    await admin.from("notifications").insert({
      user_id: userId,
      lead_id: leadId,
      type: "lead_assigned",
      title: "New Lead Assigned",
      body: "A new lead has been assigned to you."
    });
  }

  revalidatePath("/leads");
  return { error: null };
}

