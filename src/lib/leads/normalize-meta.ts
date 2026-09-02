import type { NormalizedLead, LeadPlatform } from "./types";
import { normalizePhoneNumber } from "./phone";

/** A single `changes[].value` entry from a Meta `leadgen` webhook notification. */
export interface MetaLeadgenChangeValue {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string; // legacy field name Meta still sends for ad set id
  created_time?: number;
  [key: string]: unknown;
}

/** The full webhook envelope Meta POSTs to /api/webhooks/meta. */
export interface MetaWebhookEnvelope {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: MetaLeadgenChangeValue }>;
  }>;
}

/** Extracts every leadgen change-value out of a webhook envelope. */
export function extractLeadgenNotifications(
  envelope: MetaWebhookEnvelope,
): MetaLeadgenChangeValue[] {
  const notifications: MetaLeadgenChangeValue[] = [];
  for (const entry of envelope.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        notifications.push(change.value);
      }
    }
  }
  return notifications;
}

/** A single field_data entry from the Graph API lead-detail response. */
export interface MetaFieldDataEntry {
  name?: string;
  values?: string[];
}

/** The Graph API `GET /{leadgen_id}` response shape (fields we use). */
export interface MetaLeadDetail {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string; // e.g. "fb" | "ig"
  field_data?: MetaFieldDataEntry[];
  [key: string]: unknown;
}

function fieldValue(fields: MetaFieldDataEntry[] | undefined, name: string): string | null {
  const match = fields?.find((f) => f.name === name);
  const value = match?.values?.[0]?.trim();
  return value ? value : null;
}

function mapPlatform(raw: string | undefined): LeadPlatform {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "ig" || normalized === "instagram") return "instagram";
  if (normalized === "fb" || normalized === "facebook") return "facebook";
  return null;
}

export class MetaLeadValidationError extends Error {}

/**
 * Normalizes a Graph API lead-detail response (fetched after receiving a
 * webhook notification — the notification itself only carries IDs, not the
 * submitted field values).
 */
export function normalizeMetaLead(detail: MetaLeadDetail): NormalizedLead {
  if (!detail.id) {
    throw new MetaLeadValidationError("Missing lead id in Meta lead detail response");
  }

  const fields = detail.field_data;
  const fullName = fieldValue(fields, "full_name");
  const rawPhone = fieldValue(fields, "phone_number");

  const submittedAt = detail.created_time
    ? new Date(detail.created_time).toISOString()
    : new Date().toISOString();

  return {
    source: "meta_ads",
    external_lead_id: String(detail.id),
    full_name: fullName,
    phone_number: normalizePhoneNumber(rawPhone),
    email: fieldValue(fields, "email"),
    campaign_name: detail.campaign_name ?? null,
    // The UI column is "Ad Group" but Meta's own concept is an "ad set";
    // we intentionally map ad set name into ad_group_name to keep one
    // unified table (see spec).
    ad_group_name: detail.adset_name ?? null,
    ad_name: detail.ad_name ?? null,
    budget_range: null,
    bhk_configuration: null,
    planning_timeline: null,
    platform: mapPlatform(detail.platform),
    source_submitted_at: submittedAt,
    raw_payload: detail as Record<string, unknown>,
  };
}
