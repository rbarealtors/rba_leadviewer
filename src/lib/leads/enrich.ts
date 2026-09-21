import type { Lead } from "@/lib/leads/types";
import {
  resolveGoogleCampaignName,
  resolveGoogleAdGroupName,
  resolvePropertyName,
} from "@/lib/leads/google-ads-map";

export const LEADS_SELECT_FIELDS =
  "id, external_lead_id, full_name, phone_number, email, campaign_name, ad_group_name, ad_name, budget_range, bhk_configuration, planning_timeline, source, source_submitted_at, viewed_at, raw_payload, assigned_to, assigned_at, lead_status, disposition, disposition_details, next_follow_up, lead_stage, token_amount, closed_at, needs_staff_review, platform";

/**
 * Enriches a list of raw database leads with resolved human-readable campaign and ad group names
 * for Google Ads (from campaign_mappings) and portal leads (from property mappings).
 */
export async function enrichLeadsWithResolvedNames(rawLeads: any[]): Promise<Lead[]> {
  return Promise.all(
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

      return lead as Lead;
    })
  );
}
