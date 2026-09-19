"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveGoogleCampaignName,
  resolvePropertyName,
} from "@/lib/leads/google-ads-map";
import { isAdmin } from "@/lib/auth/authorization";

export interface AttributionRow {
  source: string;
  campaign: string;
  leads: number;
  contacted: number;
  interested: number;
  siteVisit: number;
  booking: number;
  closedWon: number;
  lost: number;
}

export async function getAttributionReportAction(): Promise<{ data: AttributionRow[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Not signed in." };
    }

    if (!isAdmin(user) && user.app_metadata?.role !== "staff") {
      return { data: null, error: "Not authorized." };
    }

    const admin = createSupabaseAdminClient();

    // Fetch leads and their disposition history
    // Fetch leads and their activities
    const { data: leads, error } = await admin
      .from("leads")
      .select(`
        id,
        source,
        campaign_name,
        ad_group_name,
        ad_name,
        raw_payload,
        crm_disposition,
        lead_disposition_history ( new_disposition ),
        lead_stage,
        lead_activities ( type, details )
      `);

    if (error) {
      console.error("Error fetching leads for attribution:", error);
      return { data: null, error: "Failed to fetch attribution data." };
    }

    const aggregated = new Map<string, AttributionRow>();

    for (const lead of leads || []) {
      const source = lead.source || "Unknown";
      let campaign = lead.campaign_name || "Organic";

      // 1. Resolve campaign name using existing logic (Phase 1 discovery)
      if (source === "google_ads") {
        const payload = (lead.raw_payload as Record<string, unknown>) || {};
        const rawCampId = payload.campaign_id != null ? String(payload.campaign_id).trim() : null;
        const campaignLookupKey = rawCampId || lead.campaign_name;
        campaign = (await resolveGoogleCampaignName(campaignLookupKey)) ?? campaign;
      } else if (source === "magicbricks" || source === "99acres") {
        const payload = (lead.raw_payload as Record<string, unknown>) || {};
        const parsed = (payload.parsed as Record<string, unknown>) || {};
        const propertyId = parsed.property_id != null ? String(parsed.property_id).trim() : null;
        const adNamePropIdMatch = lead.ad_name?.match(/Property\s+([A-Za-z0-9]+)/i);
        const effectivePropId = propertyId || (adNamePropIdMatch ? adNamePropIdMatch[1] : null);

        if (effectivePropId) {
          const mappedProject = await resolvePropertyName(effectivePropId);
          if (mappedProject) {
            campaign = mappedProject;
          }
        }
      }

      // Grouping key
      const key = `${source}|${campaign}`;
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          source,
          campaign,
          leads: 0,
          contacted: 0,
          interested: 0,
          siteVisit: 0,
          booking: 0,
          closedWon: 0,
          lost: 0,
        });
      }

      const row = aggregated.get(key)!;

      // 2. Compute funnel flags based on history and current state
      const history = (lead.lead_disposition_history || []).map((h: any) => h.new_disposition);
      const allDispositions = new Set([lead.crm_disposition, ...history]);
      // 2. Compute canonical funnel flags based on lead_stage and lead_activities
      const stagesReached = new Set<string>();

      // Helper to check if lead reached a state OR a state further down the funnel
      // Funnel definition explicitly from prompt:
      
      // Leads: total count
      row.leads += 1;
      if (lead.lead_stage) {
        stagesReached.add(lead.lead_stage);
      }

      // Contacted: Reached a contacted state (anything other than Not Contacted means they were contacted)
      const isContacted = allDispositions.size > 0 && 
        [...allDispositions].some(d => d !== "Not Contacted");
      
      if (isContacted) row.contacted += 1;
      // Infer lower funnel stages from higher current stages
      if (lead.lead_stage === "CLOSED") {
        stagesReached.add("BOOKING");
        stagesReached.add("SITE_VISIT");
        stagesReached.add("CONTACTED");
      } else if (lead.lead_stage === "BOOKING") {
        stagesReached.add("SITE_VISIT");
        stagesReached.add("CONTACTED");
      } else if (lead.lead_stage === "SITE_VISIT") {
        stagesReached.add("CONTACTED");
      }

      // Interested: crm_disposition indicates 'Contacted — Interested' 
      // OR they moved further down the funnel (Site Visit Scheduled/Done, Closed Won/Lost)
      // Because to have a Site Visit or Closed, they must have been interested.
      const isInterested = allDispositions.has("Contacted — Interested") || 
                           allDispositions.has("Site Visit Scheduled") ||
                           allDispositions.has("Site Visit Done") ||
                           allDispositions.has("Closed — Won");
      // Check activity trail for historical stage progression (especially for leads currently in LOST)
      const activities = Array.isArray(lead.lead_activities) ? lead.lead_activities : [];
      for (const act of activities) {
        const type = (act as { type?: string; details?: any }).type;
        const details = (act as { type?: string; details?: any }).details;

      if (isInterested) row.interested += 1;
        if (type === "call_outcome") {
          if (details?.new_stage) {
            stagesReached.add(details.new_stage);
          } else {
            stagesReached.add("CONTACTED");
          }
        } else if (type === "site_visit_scheduled" || type === "site_visit_completed") {
          stagesReached.add("CONTACTED");
          stagesReached.add("SITE_VISIT");
        } else if (type === "booking_started") {
          stagesReached.add("CONTACTED");
          stagesReached.add("SITE_VISIT");
          stagesReached.add("BOOKING");
        } else if (type === "token_received" || type === "lead_closed") {
          stagesReached.add("CONTACTED");
          stagesReached.add("SITE_VISIT");
          stagesReached.add("BOOKING");
          stagesReached.add("CLOSED");
        } else if (type === "stage_change" && details?.new_stage) {
          stagesReached.add(details.new_stage);
        }
      }

      // Site Visit: reached the site-visit portion of the workflow
      const isSiteVisit = allDispositions.has("Site Visit Scheduled") ||
                          allDispositions.has("Site Visit Done") ||
                          allDispositions.has("Closed — Won"); // usually closed won means site visit was done
      // Leads: total count
      row.leads += 1;

      if (isSiteVisit) row.siteVisit += 1;

      // Closed Won: canonical disposition is 'Closed — Won'
      const isClosedWon = allDispositions.has("Closed — Won");

      if (isClosedWon) row.closedWon += 1;
      // Funnel stages progression
      if (stagesReached.has("CONTACTED")) row.contacted += 1;
      if (stagesReached.has("SITE_VISIT")) row.siteVisit += 1;
      if (stagesReached.has("BOOKING")) row.booking += 1;
      if (stagesReached.has("CLOSED")) row.closedWon += 1;
      if (stagesReached.has("LOST") || lead.lead_stage === "LOST") row.lost += 1;
    }

    const data = Array.from(aggregated.values());

    // Sort by Leads (desc)
    data.sort((a, b) => b.leads - a.leads);

    return { data, error: null };
  } catch (err) {
    console.error("Error generating attribution report:", err);
    return { data: null, error: "Internal server error." };
  }
}

