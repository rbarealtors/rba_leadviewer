import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppHeader } from "@/app/AppHeader";
import { isAdmin } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";
import { CampaignMappingsClient } from "./CampaignMappingsClient";
import defaultMappings from "@/lib/leads/google-ads-map.json";

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

  const mappedIds = new Set(mappings?.map((m) => String(m.id).trim()) || []);
  const unmapped = new Map<string, { id: string; type: "campaign" | "adgroup" | "property" }>();
  
  const defaultLinks: Record<string, string[]> = (defaultMappings as any).campaignToAdGroups || {};
  const campaignToAdGroups: Record<string, string[]> = {};
  for (const [cId, agList] of Object.entries(defaultLinks)) {
    campaignToAdGroups[cId] = [...agList];
  }

  // 2. Scan recent Google Ads leads for unmapped IDs
  const { data: recentGoogleLeads } = await supabase
    .from("leads")
    .select("campaign_name, ad_group_name, raw_payload")
    .eq("source", "google_ads")
    .order("source_submitted_at", { ascending: false })
    .limit(1000);

  if (recentGoogleLeads) {
    for (const lead of recentGoogleLeads) {
      const payload = (lead.raw_payload as Record<string, unknown>) || {};
      const rawCampId = payload.campaign_id != null ? String(payload.campaign_id).trim() : null;
      const campIdMatch = lead.campaign_name?.match(/\b(\d{6,15})\b/);
      const campId = rawCampId || (campIdMatch ? campIdMatch[1] : lead.campaign_name);
      if (campId && /^\d+$/.test(campId) && !mappedIds.has(campId)) {
        unmapped.set(campId, { id: campId, type: "campaign" });
      }

      const rawAdGroupId = payload.adgroup_id != null ? String(payload.adgroup_id).trim() : null;
      const adIdMatch = lead.ad_group_name?.match(/\b(\d{6,15})\b/);
      const adId = rawAdGroupId || (adIdMatch ? adIdMatch[1] : lead.ad_group_name);
      if (adId && /^\d+$/.test(adId) && !mappedIds.has(adId)) {
        unmapped.set(adId, { id: adId, type: "adgroup" });
      }
      if (campId && adId) {
        if (!campaignToAdGroups[campId]) campaignToAdGroups[campId] = [];
        if (!campaignToAdGroups[campId].includes(adId)) {
          campaignToAdGroups[campId].push(adId);
        }
      }
    }
  }

  // 3. Scan recent portal leads for unmapped Property IDs
  // 3. Scan recent Meta leads for campaign-adset links
  const { data: recentMetaLeads } = await supabase
    .from("leads")
    .select("campaign_name, ad_group_name, raw_payload")
    .eq("source", "meta_ads")
    .order("source_submitted_at", { ascending: false })
    .limit(500);

  if (recentMetaLeads) {
    for (const lead of recentMetaLeads) {
      const payload = (lead.raw_payload as Record<string, unknown>) || {};
      const rawCampId = payload.campaign_id != null ? String(payload.campaign_id).trim() : null;
      const campId = rawCampId || lead.campaign_name;
      const rawAdGroupId = payload.adset_id != null ? String(payload.adset_id).trim() : null;
      const adId = rawAdGroupId || lead.ad_group_name;

      if (campId && adId) {
        if (!campaignToAdGroups[campId]) campaignToAdGroups[campId] = [];
        if (!campaignToAdGroups[campId].includes(adId)) {
          campaignToAdGroups[campId].push(adId);
        }
      }
    }
  }

  // 4. Scan recent portal leads for unmapped Property IDs
  const { data: portalLeads } = await supabase
    .from("leads")
    .select("source, ad_name, raw_payload")
    .in("source", ["magicbricks", "99acres"])
    .order("source_submitted_at", { ascending: false })
    .limit(500);

  if (portalLeads) {
    for (const lead of portalLeads) {
      const payload = (lead.raw_payload as Record<string, unknown>) || {};
      const parsed = (payload.parsed as Record<string, unknown>) || {};
      const propId = parsed.property_id != null ? String(parsed.property_id).trim() : null;
      const adNameMatch = lead.ad_name?.match(/Property\s+([A-Za-z0-9]+)/i);
      const effectivePropId = propId || (adNameMatch ? adNameMatch[1] : null);

      if (effectivePropId && !mappedIds.has(effectivePropId)) {
        unmapped.set(effectivePropId, { id: effectivePropId, type: "property" });
      }
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user.email} isAdmin={true} />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink">Campaign Mappings</h1>
          <p className="text-subtle mt-1 text-sm">
            Map raw numeric IDs from Google Ads and Property IDs from real estate portals to human-readable names.
          </p>
        </div>
        <CampaignMappingsClient 
          initialMappings={mappings || []} 
          unmappedIds={Array.from(unmapped.values())} 
          campaignToAdGroups={campaignToAdGroups}
        />
      </main>
    </div>
  );
}

