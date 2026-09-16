export type LeadSource = "google_ads" | "meta_ads" | "99acres" | "magicbricks" | "direct_walk_in" | "phone_call" | "referral";
export type LeadPlatform = "facebook" | "instagram" | null;

/** Canonical CRM disposition values — Phase 1A. */
export type CrmDisposition =
  | "Not Contacted"
  | "Contacted — No Answer"
  | "Contacted — Interested"
  | "Contacted — Not Interested"
  | "Budget Mismatch"
  | "Site Visit Scheduled"
  | "Site Visit Done"
  | "Closed — Won"
  | "Closed — Lost";

export const CANONICAL_DISPOSITIONS: readonly CrmDisposition[] = [
  "Not Contacted",
  "Contacted — No Answer",
  "Contacted — Interested",
  "Contacted — Not Interested",
  "Budget Mismatch",
  "Site Visit Scheduled",
  "Site Visit Done",
  "Closed — Won",
  "Closed — Lost",
] as const;


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
  assigned_to?: string | null;
  assigned_at?: string | null;
  lead_status?: string | null;
  disposition?: string | null;
  disposition_details?: Record<string, any> | null;
  next_follow_up?: string | null;
  rnr_streak?: number;
  needs_staff_review?: boolean;
  lead_stage?: LeadStage;
  token_amount?: number | null;
  token_received_at?: string | null;
  token_payment_method?: string | null;
  token_reference_number?: string | null;
  booking_unit_details?: string | null;
  closed_at?: string | null;
  // Phase 1A — canonical CRM disposition tracking
  crm_disposition?: CrmDisposition | null;
  disposition_updated_at?: string | null;
  disposition_updated_by?: string | null;
}


export type LeadStage = "NEW" | "CONTACTED" | "SITE_VISIT" | "BOOKING" | "CLOSED" | "LOST";
export type SiteVisitStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
export type ActivityType = "call_outcome" | "follow_up_scheduled" | "stage_change" | "site_visit_scheduled" | "site_visit_completed" | "site_visit_cancelled" | "site_visit_rescheduled" | "booking_started" | "token_received" | "lead_closed" | "lead_assigned" | "note_added";
export type NotificationType = "lead_assigned" | "follow_up_reminder" | "system_alert";

export interface SiteVisit {
  id: string;
  lead_id: string;
  assigned_to?: string | null;
  created_by?: string | null;
  visit_number: number;
  scheduled_at: string;
  status: SiteVisitStatus;
  property_name?: string | null;
  location?: string | null;
  notes?: string | null;
  outcome_notes?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  rescheduled_from_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id?: string | null;
  type: ActivityType;
  title: string;
  description?: string | null;
  details?: Record<string, any> | null;
  created_at: string;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  assigned_by?: string | null;
  assigned_to?: string | null;
  previous_assigned_to?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  lead_id?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  metadata?: Record<string, any> | null;
  read_at?: string | null;
  created_at: string;
}

/** Phase 1A — immutable record of every crm_disposition change. */
export interface LeadDispositionHistory {
  id: string;
  lead_id: string;
  old_disposition: CrmDisposition | null;
  new_disposition: CrmDisposition;
  changed_by: string | null;
  changed_at: string;
  note?: string | null;
}
