import type { NormalizedLead } from "./types";
import { resolveGoogleCampaignName, resolveGoogleAdGroupName } from "./google-ads-map";

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

function findColumnByPattern(
  columns: GoogleWebhookColumn[] | undefined,
  testFn: (id: string, name: string) => boolean,
): string | null {
  const match = columns?.find((c) =>
    testFn((c.column_id ?? "").toLowerCase(), (c.column_name ?? "").toLowerCase()),
  );
  return match?.string_value?.trim() || null;
}

export class GoogleWebhookValidationError extends Error {}

export async function normalizeGoogleLead(payload: GoogleWebhookPayload): Promise<NormalizedLead> {
  if (!payload.lead_id) {
    throw new GoogleWebhookValidationError("Missing lead_id in Google webhook payload");
  }

  const columns = payload.user_column_data;

  const fullName =
    columnValue(columns, "FULL_NAME") ??
    (
      [columnValue(columns, "FIRST_NAME"), columnValue(columns, "LAST_NAME")]
        .filter(Boolean)
        .join(" ")
        .trim() || null
    );

  const submittedAt = payload.lead_submit_time
    ? new Date(payload.lead_submit_time).toISOString()
    : new Date().toISOString();

  const resolvedCampaign = payload.campaign_id
    ? (await resolveGoogleCampaignName(payload.campaign_id)) || `Campaign ${payload.campaign_id}`
    : null;

  const resolvedAdGroup = payload.adgroup_id
    ? (await resolveGoogleAdGroupName(payload.adgroup_id)) || `Ad Group ${payload.adgroup_id}`
    : null;

  const budget =
    columnValue(columns, "PRICE_RANGE") ??
    columnValue(columns, "TRAVEL_BUDGET") ??
    findColumnByPattern(columns, (id, name) => id.includes("budget") || name.includes("budget"));

  const bhk =
    columnValue(columns, "NUMBER_OF_BEDROOMS") ??
    columnValue(columns, "PROPERTY_TYPE") ??
    findColumnByPattern(columns, (id, name) => id.includes("configuration") || id.includes("bedroom") || id.includes("bhk") || name.includes("configuration"));

  const timeline =
    columnValue(columns, "PURCHASE_TIMELINE") ??
    columnValue(columns, "NEXT_PLANNED_PURCHASE") ??
    findColumnByPattern(columns, (id, name) => id.includes("purchase") || id.includes("timeline") || name.includes("purchase") || name.includes("timeline"));

  return {
    source: "google_ads",
    external_lead_id: String(payload.lead_id),
    full_name: fullName || null,
    phone_number: columnValue(columns, "PHONE_NUMBER"),
    email: columnValue(columns, "EMAIL") ?? columnValue(columns, "WORK_EMAIL"),
    campaign_name: resolvedCampaign,
    ad_group_name: resolvedAdGroup,
    ad_name: null,
    budget_range: budget,
    bhk_configuration: bhk,
    planning_timeline: timeline,
    platform: null,
    source_submitted_at: submittedAt,
    raw_payload: payload as Record<string, unknown>,
  };
}
