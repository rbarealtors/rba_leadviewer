import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppHeader } from "@/app/AppHeader";
import { isAdmin } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";
import { CampaignMappingsClient } from "./CampaignMappingsClient";

export const dynamic = "force-dynamic";

export default async function CampaignMappingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdmin(user)) {
    redirect("/leads");
  }

  // 1. Fetch existing mappings
  const { data: mappings } = await supabase
    .from("campaign_mappings")
    .select("*")
    .order("type", { ascending: true })
    .order("display_name", { ascending: true });

  // 2. Scan recent leads for unmapped numeric IDs
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("campaign_name, ad_group_name")
    .eq("source", "google_ads")
    .order("source_submitted_at", { ascending: false })
    .limit(1000);

  const mappedIds = new Set(mappings?.map((m) => m.id) || []);
  const unmapped = new Map<string, { id: string; type: "campaign" | "adgroup" }>();

  if (recentLeads) {
    for (const lead of recentLeads) {
      const campIdMatch = lead.campaign_name?.match(/\b(\d{6,15})\b/);
      const campId = campIdMatch ? campIdMatch[1] : lead.campaign_name;
      if (campId && /^\d+$/.test(campId) && !mappedIds.has(campId)) {
        unmapped.set(campId, { id: campId, type: "campaign" });
      }

      const adIdMatch = lead.ad_group_name?.match(/\b(\d{6,15})\b/);
      const adId = adIdMatch ? adIdMatch[1] : lead.ad_group_name;
      if (adId && /^\d+$/.test(adId) && !mappedIds.has(adId)) {
        unmapped.set(adId, { id: adId, type: "adgroup" });
      }
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user.email} isAdmin={true} />
      <main className="max-w-[1000px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink">Campaign Mappings</h1>
          <p className="text-subtle mt-1 text-sm">
            Map raw numeric IDs from Google Ads to human-readable names.
          </p>
        </div>
        <CampaignMappingsClient 
          initialMappings={mappings || []} 
          unmappedIds={Array.from(unmapped.values())} 
        />
      </main>
    </div>
  );
}

