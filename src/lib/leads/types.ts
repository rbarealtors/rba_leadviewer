export type LeadSource = "google_ads" | "meta_ads" | "facebook_sheets_bridge";
export type LeadPlatform = "facebook" | "instagram" | null;

/** Shape of a row as it's inserted into public.leads. */
export interface NormalizedLead {
  source: LeadSource;
  external_lead_id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  campaign_name: string | null;
  ad_group_name: string | null;
  ad_name: string | null;
  budget_range: string | null;
  bhk_configuration: string | null;
  planning_timeline: string | null;
  platform: LeadPlatform;
  source_submitted_at: string; // ISO 8601 UTC
  raw_payload: Record<string, unknown>;
}

/** Shape of a row as read back from public.leads (includes DB-assigned fields). */
export interface Lead extends NormalizedLead {
  id: string;
  created_at: string;
  viewed_at: string | null;
}
