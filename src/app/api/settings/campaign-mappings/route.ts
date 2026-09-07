import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidateMappingsCache } from "@/lib/leads/google-ads-map";

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

    const cleanId = String(id ?? "").trim();
    const cleanDisplayName = String(display_name ?? "").trim();

    if (!cleanId || !type || !cleanDisplayName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["campaign", "adgroup", "property"].includes(type)) {
      return NextResponse.json({ error: "Invalid mapping type" }, { status: 400 });
    }

    // Upsert mapping
    const { error: upsertError } = await supabase
      .from("campaign_mappings")
      .upsert({
        id: cleanId,
        type,
        display_name: cleanDisplayName,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      throw upsertError;
    }

    // Clear server in-memory mapping cache immediately
    invalidateMappingsCache();

    // Update historical leads in public.leads matching this ID
    const { createClient } = await import("@supabase/supabase-js");
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (type === "campaign") {
      const [byCol, byPayload] = await Promise.all([
        adminSupabase.from("leads").select("*").eq("source", "google_ads").ilike("campaign_name", `%${cleanId}%`),
        adminSupabase.from("leads").select("*").eq("source", "google_ads").filter("raw_payload->>campaign_id", "eq", cleanId),
      ]);
      const combined = [...(byCol.data || []), ...(byPayload.data || [])];
      const leadMap = new Map();
      combined.forEach((l) => leadMap.set(l.id, l));
      const matchedLeads = Array.from(leadMap.values());

      for (const lead of matchedLeads) {
        const newLead = { ...lead, campaign_name: cleanDisplayName };
        await adminSupabase.from("leads").delete().eq("id", lead.id);
        await adminSupabase.from("leads").insert([newLead]);
      }
    } else if (type === "adgroup") {
      const [byCol, byPayload] = await Promise.all([
        adminSupabase.from("leads").select("*").in("source", ["google_ads", "meta_ads"]).ilike("ad_group_name", `%${cleanId}%`),
        adminSupabase.from("leads").select("*").in("source", ["google_ads", "meta_ads"]).filter("raw_payload->>adgroup_id", "eq", cleanId),
      ]);
      const combined = [...(byCol.data || []), ...(byPayload.data || [])];
      const leadMap = new Map();
      combined.forEach((l) => leadMap.set(l.id, l));
      const matchedLeads = Array.from(leadMap.values());

      for (const lead of matchedLeads) {
        const newLead = { ...lead, ad_group_name: cleanDisplayName };
        await adminSupabase.from("leads").delete().eq("id", lead.id);
        await adminSupabase.from("leads").insert([newLead]);
      }
    } else if (type === "property") {
      const [byCol, byPayload] = await Promise.all([
        adminSupabase.from("leads").select("*").in("source", ["magicbricks", "99acres"]).ilike("ad_name", `%${cleanId}%`),
        adminSupabase.from("leads").select("*").in("source", ["magicbricks", "99acres"]).filter("raw_payload->parsed->>property_id", "eq", cleanId),
      ]);
      const combined = [...(byCol.data || []), ...(byPayload.data || [])];
      const leadMap = new Map();
      combined.forEach((l) => leadMap.set(l.id, l));
      const matchedLeads = Array.from(leadMap.values());

      for (const lead of matchedLeads) {
        const newLead = { ...lead, campaign_name: cleanDisplayName };
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

    invalidateMappingsCache();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

