import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SalesClient } from "./SalesClient";
import type { Lead } from "@/lib/leads/types";

export default async function SalesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null; // Handled by middleware
  }

  // Fetch initial leads assigned to auth.uid() where lead_status != 'closed', ordered by assigned_at desc
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, full_name, phone_number, email, campaign_name, budget_range, bhk_configuration, planning_timeline, source, assigned_at, lead_status, disposition")
    .eq("assigned_to", user.id)
    .neq("lead_status", "closed")
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("Error fetching sales leads:", error);
  }

  const initialLeads = (leads as Lead[]) || [];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col relative">
      <SalesClient initialLeads={initialLeads} userName={user.user_metadata?.full_name || "Sales Rep"} />
    </div>
  );
}

