import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/leads/types";
import { LeadsClient } from "./LeadsClient";
import { AppHeader } from "@/app/AppHeader";
import { isAdmin } from "@/lib/auth/authorization";
import {
  resolveGoogleCampaignName,
  resolveGoogleAdGroupName,
  resolvePropertyName,
} from "@/lib/leads/google-ads-map";


export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login before
  // this ever renders, but we guard again here since this is also where
  // the actual data fetch happens and RLS is the real boundary, not this
  // check.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("source_submitted_at", { ascending: false });

  const rawLeads = (data ?? []);
  const leads: Lead[] = await Promise.all(
    rawLeads.map(async (lead) => {
      if (lead.source === "google_ads") {
        const payload = (lead.raw_payload as Record<string, unknown>) || {};
        const rawCampId = payload.campaign_id != null ? String(payload.campaign_id).trim() : null;
        const rawAdGroupId = payload.adgroup_id != null ? String(payload.adgroup_id).trim() : null;

        const campaignLookupKey = rawCampId || lead.campaign_name;
        const adGroupLookupKey = rawAdGroupId || lead.ad_group_name;

        const campaignName = (await resolveGoogleCampaignName(campaignLookupKey)) ?? lead.campaign_name;
        const adGroupName = (await resolveGoogleAdGroupName(adGroupLookupKey)) ?? lead.ad_group_name;
        return {
          ...lead,
          campaign_name: campaignName,
          ad_group_name: adGroupName,
        };
      }

      if (lead.source === "magicbricks" || lead.source === "99acres") {
        const payload = (lead.raw_payload as Record<string, unknown>) || {};
        const parsed = (payload.parsed as Record<string, unknown>) || {};
        const propertyId = parsed.property_id != null ? String(parsed.property_id).trim() : null;
        const adNamePropIdMatch = lead.ad_name?.match(/Property\s+([A-Za-z0-9]+)/i);
        const effectivePropId = propertyId || (adNamePropIdMatch ? adNamePropIdMatch[1] : null);

        if (effectivePropId) {
          const mappedProject = await resolvePropertyName(effectivePropId);
          if (mappedProject) {
            return {
              ...lead,
              campaign_name: mappedProject,
            };
          }
        }
      }

      return lead;
    })
  );

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user?.email} isAdmin={isAdmin(user)} />

      <main className="w-full mx-auto px-4 md:px-6 py-5 transition-[max-width] duration-150" style={{ maxWidth: "var(--dashboard-width, 1400px)" }}>
        {error ? (
          <p className="text-sm text-red-600">Could not load leads. Please refresh.</p>
        ) : (
          <LeadsClient initialLeads={leads} />
        )}
      </main>
    </div>
  );
}
