import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyHmacSha256 } from "@/lib/verify-signature";
import {
  extractLeadgenNotifications,
  normalizeMetaLead,
  MetaLeadValidationError,
  type MetaWebhookEnvelope,
  type MetaLeadDetail,
} from "@/lib/leads/normalize-meta";

// Graph API version current as of implementation time (Feb 2026 release).
// Bump this when Meta deprecates it — see
// https://developers.facebook.com/docs/graph-api/changelog
const GRAPH_API_VERSION = "v25.0";

const LEAD_FIELDS = [
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "platform",
  "field_data",
].join(",");

function jsonError(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

/**
 * Meta's GET webhook subscription handshake:
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return jsonError(403, "Verification failed");
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!appSecret || !accessToken) {
    console.error("meta webhook: META_APP_SECRET or META_ACCESS_TOKEN not configured");
    return jsonError(500, "Server misconfigured");
  }

  // Signature verification requires the raw, unparsed body.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const valid = await verifyHmacSha256(rawBody, signature, appSecret);
  if (!valid) {
    return jsonError(401, "Invalid signature");
  }

  let envelope: MetaWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as MetaWebhookEnvelope;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const notifications = extractLeadgenNotifications(envelope);
  if (notifications.length === 0) {
    // Not a leadgen change (could be a different subscribed field, or a
    // test ping) — nothing to do, but it's a valid, expected delivery.
    return NextResponse.json({}, { status: 200 });
  }

  const supabase = createSupabaseAdminClient();
  let hadTransientFailure = false;

  for (const notification of notifications) {
    const leadgenId = notification.leadgen_id!;

    let detail: MetaLeadDetail;
    try {
      const graphUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}?fields=${LEAD_FIELDS}&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(graphUrl);

      if (!response.ok) {
        console.error("meta webhook: Graph API fetch failed", {
          leadgenId,
          status: response.status,
        });
        hadTransientFailure = true;
        continue;
      }

      detail = (await response.json()) as MetaLeadDetail;
    } catch (err) {
      console.error("meta webhook: Graph API fetch threw", { leadgenId, err });
      hadTransientFailure = true;
      continue;
    }

    let normalized;
    try {
      normalized = normalizeMetaLead(detail);
    } catch (err) {
      if (err instanceof MetaLeadValidationError) {
        console.error("meta webhook: could not normalize lead", { leadgenId, message: err.message });
        continue; // malformed lead detail — not retryable, skip it
      }
      throw err;
    }

    const { error } = await supabase.from("leads").insert(normalized);
    if (error) {
      if (error.code === "23505") {
        // Duplicate delivery of a lead we already have — success.
        continue;
      }
      console.error("meta webhook: insert failed", { leadgenId, code: error.code });
      hadTransientFailure = true;
    }
  }

  // If any lead in this batch failed for a transient reason, return 5xx so
  // Meta retries the whole delivery. Leads that were successfully inserted
  // are protected from being duplicated on retry by the unique constraint.
  if (hadTransientFailure) {
    return jsonError(500, "Some leads could not be processed");
  }

  return NextResponse.json({}, { status: 200 });
}
