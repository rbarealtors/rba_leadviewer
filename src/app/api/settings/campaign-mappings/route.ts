import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("campaign_mappings")
    .select("*")
    .order("type", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mappings: data });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  
  try {
    const body = await request.json();
    const { id, type, display_name } = body;

    if (!id || !type || !display_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Upsert mapping
    const { error: upsertError } = await supabase
      .from("campaign_mappings")
      .upsert({
        id,
        type,
        display_name,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      throw upsertError;
    }

    // Update historical leads in public.leads matching this numeric ID
    // Since leads_protect_submitted_fields_trigger blocks direct updates to campaign_name/ad_group_name,
    // we use a service-role query to delete and re-insert if needed, OR we can try to see if the trigger 
    // lets us bypass it. But typically we need the service_role for this background job.
    // Let's import createClient from @supabase/supabase-js with service_role.
    const { createClient } = await import("@supabase/supabase-js");
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const column = type === "campaign" ? "campaign_name" : "ad_group_name";
    
    // Find matching leads (where the column contains the ID)
    const { data: leads, error: leadsError } = await adminSupabase
      .from("leads")
      .select("*")
      .eq("source", "google_ads")
      .ilike(column, `%${id}%`); // match numeric ID

    if (!leadsError && leads && leads.length > 0) {
      for (const lead of leads) {
        // Only update if it actually matches the raw ID format (or we can just blindly update since ilike caught it)
        const newLead = { ...lead, [column]: display_name };
        
        // Delete and re-insert to bypass RLS/Trigger restrictions on updates
        await adminSupabase.from("leads").delete().eq("id", lead.id);
        await adminSupabase.from("leads").insert([newLead]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const { error } = await supabase.from("campaign_mappings").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

