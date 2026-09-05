import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  GoogleWebhookValidationError,
  normalizeGoogleLead,
  type GoogleWebhookPayload,
} from "@/lib/leads/normalize-google";

// Public endpoint — Google needs to reach this directly. Authenticity is
// verified via the `google_key` field inside the JSON body (see
// https://developers.google.com/google-ads/webhook/docs/implementation),
// not via a header or cookie.

function jsonError(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const secret = process.env.GOOGLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("google-ads webhook: GOOGLE_WEBHOOK_SECRET is not configured");
    return jsonError(500, "Server misconfigured");
  }

  let payload: GoogleWebhookPayload;
  try {
    payload = (await request.json()) as GoogleWebhookPayload;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof payload !== "object" || payload === null) {
    return jsonError(400, "Invalid payload");
  }

  // Anti-spoofing check per Google's documented recommendation: compare
  // google_key against the secret configured on this lead form asset.
  if (!payload.google_key || payload.google_key !== secret) {
    return jsonError(401, "Invalid or missing google_key");
  }

  // Test leads are still real, valid deliveries per Google's docs
  // ("if value is false or if field is not present, treat this lead as
  // valid production lead") — but we don't want test submissions cluttering
  // a real internal lead list, so we acknowledge them without storing them.
  if (payload.is_test) {
    return NextResponse.json({}, { status: 200 });
  }

  let normalized;
  try {
    normalized = await normalizeGoogleLead(payload);
  } catch (err) {
    if (err instanceof GoogleWebhookValidationError) {
      return jsonError(400, err.message);
    }
    console.error("google-ads webhook: normalization failed", err);
    return jsonError(400, "Could not parse lead payload");
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("leads").insert(normalized);

    if (error) {
      // Postgres unique_violation on (source, external_lead_id): a
      // duplicate delivery of a lead we already stored. This is success,
      // not an error, per the idempotency requirement.
      if (error.code === "23505") {
        return NextResponse.json({}, { status: 200 });
      }
      console.error("google-ads webhook: insert failed", {
        code: error.code,
        leadId: normalized.external_lead_id,
      });
      return jsonError(500, "Could not persist lead");
    }

    return NextResponse.json({}, { status: 200 });
  } catch (err) {
    console.error("google-ads webhook: unexpected error", err);
    return jsonError(500, "Unexpected server error");
  }
}
