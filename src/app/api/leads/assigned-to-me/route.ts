import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, message: "Not authenticated" }), {
        status: 401,
      });
    }

    const { data, error } = await supabase
      .from("leads")
      .select("id, full_name, phone_number, email, campaign_name, budget_range, bhk_configuration, planning_timeline, source, assigned_at, lead_status, disposition")
      .eq("assigned_to", user.id)
      .neq("lead_status", "closed")
      .order("assigned_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error);
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ leads: data }), {
      status: 200,
    });
  } catch (error) {
    console.error("Fetch assigned leads error:", error);
    return new Response(JSON.stringify({ success: false, message: "Internal error" }), {
      status: 500,
    });
  }
}

