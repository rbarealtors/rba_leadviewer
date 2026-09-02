import type { NormalizedLead } from "./types";

/**
 * Matches Google's WebhookLead schema:
 * https://developers.google.com/google-ads/webhook/docs/implementation
 *
 * We intentionally type this loosely (no strict interface) and only read
 * the fields we need, per Google's own forward-compatibility guidance:
 * "design your JSON parser to gracefully ignore any fields ... your system
 * does not explicitly consume."
 */
export interface GoogleWebhookColumn {
  column_id?: string;
  column_name?: string;
  string_value?: string;
}

export interface GoogleWebhookPayload {
  lead_id?: string;
  user_column_data?: GoogleWebhookColumn[];
  api_version?: string;
  form_id?: number | string;
  campaign_id?: number | string;
  adgroup_id?: number | string;
  google_key?: string;
  is_test?: boolean;
  gcl_id?: string;
  lead_submit_time?: string;
  [key: string]: unknown;
}

function columnValue(
  columns: GoogleWebhookColumn[] | undefined,
  columnId: string,
): string | null {
  const match = columns?.find((c) => c.column_id === columnId);
  const value = match?.string_value?.trim();
  return value ? value : null;
}

export class GoogleWebhookValidationError extends Error {}

/**
 * Normalizes a Google Ads lead-form webhook payload into the common lead
 * shape.
 *
 * NOTE: Google's webhook payload only carries numeric `campaign_id` /
 * `adgroup_id` / `form_id` — it does not include human-readable campaign or
 * ad group *names*. There is no supported field for that in the current
 * webhook schema. Since the UI needs *some* identifying label, we fall back
 * to `Campaign {campaign_id}` / `Form {form_id}` rather than leaving it
 * blank, and store the raw IDs in raw_payload for anyone who needs to cross
 * reference them against the Google Ads UI. This is a known limitation of
 * Google's webhook (not of this app) — documented in the README.
 */
export function normalizeGoogleLead(payload: GoogleWebhookPayload): NormalizedLead {
  if (!payload.lead_id) {
    throw new GoogleWebhookValidationError("Missing lead_id in Google webhook payload");
  }

  const columns = payload.user_column_data;

  const fullName =
    columnValue(columns, "FULL_NAME") ??
    [columnValue(columns, "FIRST_NAME"), columnValue(columns, "LAST_NAME")]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    null;

  const submittedAt = payload.lead_submit_time
    ? new Date(payload.lead_submit_time).toISOString()
    : new Date().toISOString();

  return {
    source: "google_ads",
    external_lead_id: String(payload.lead_id),
    full_name: fullName || null,
    phone_number: columnValue(columns, "PHONE_NUMBER"),
    email: columnValue(columns, "EMAIL") ?? columnValue(columns, "WORK_EMAIL"),
    campaign_name: payload.campaign_id ? `Campaign ${payload.campaign_id}` : null,
    ad_group_name: payload.adgroup_id ? `Ad Group ${payload.adgroup_id}` : null,
    ad_name: null,
    budget_range: columnValue(columns, "PRICE_RANGE") ?? columnValue(columns, "TRAVEL_BUDGET"),
    bhk_configuration: columnValue(columns, "NUMBER_OF_BEDROOMS") ?? columnValue(columns, "PROPERTY_TYPE"),
    planning_timeline:
      columnValue(columns, "PURCHASE_TIMELINE") ?? columnValue(columns, "NEXT_PLANNED_PURCHASE"),
    platform: null,
    source_submitted_at: submittedAt,
    raw_payload: payload as Record<string, unknown>,
  };
}
