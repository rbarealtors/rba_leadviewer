import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SheetsWebhookPayload = {
  secret?: unknown;
  lead?: unknown;
  external_lead_id?: unknown;
  event_id?: unknown;
};

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function value(lead: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const candidate = lead[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

export async function POST(request: Request) {
  const webhookSecret = process.env.META_SHEETS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("google-sheets webhook: META_SHEETS_WEBHOOK_SECRET is not configured");
    return jsonError(500, "Server misconfigured");
  }

  let body: SheetsWebhookPayload;
  try {
    body = (await request.json()) as SheetsWebhookPayload;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  console.log("Incoming webhook body:", JSON.stringify(body));

  if (body.secret !== webhookSecret) {
    return jsonError(401, "Unauthorized");
  }

  if (typeof body.lead !== "object" || body.lead === null || Array.isArray(body.lead)) {
    return jsonError(400, "Missing or invalid lead");
  }

  const lead = body.lead as Record<string, unknown>;
  const serializedLead = JSON.stringify(lead);
  const externalLeadId = value(body as Record<string, unknown>, "external_lead_id", "event_id")
    || value(lead, "id", "Lead ID", "lead_id")
    || createHash("sha256").update(serializedLead).digest("hex");

  const submittedAtCandidate = value(
    lead,
    "created_at",
    "created_time",
    "Created At",
    "Created Time",
    "timestamp",
    "Timestamp",
  );
  const parsedSubmittedAt = submittedAtCandidate ? new Date(submittedAtCandidate) : new Date();
  const sourceSubmittedAt = Number.isNaN(parsedSubmittedAt.getTime())
    ? new Date().toISOString()
    : parsedSubmittedAt.toISOString();

  try {
    const supabase = createSupabaseAdminClient();
    const rawPhone = value(lead, "phone", "Phone", "Phone Number", "phone_number", "Phone_Number");
    const cleanPhone = rawPhone.replace(/^p:/i, "").trim();
    const { error } = await supabase.from("leads").insert({
      external_lead_id: externalLeadId,
      full_name: value(lead, "Full Name", "full_name", "Full_Name", "Name") || "Unknown",
      phone_number: cleanPhone || null,
      email: value(lead, "Email", "email"),
      campaign_name: value(lead, "campaign_name", "Campaign Name"),
      ad_group_name: value(lead, "ad_group_name", "Ad Group Name"),
      ad_name: value(lead, "ad_name", "Ad Name"),
      source: "meta_ads",
      source_submitted_at: sourceSubmittedAt,
      raw_payload: lead,
    });

    if (error) {
      console.log("Supabase insert error:", error);
      if (error.code === "23505") return NextResponse.json({ success: true });
      return jsonError(500, "Could not persist lead");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("google-sheets webhook: unexpected error", error);
    return jsonError(500, "Unexpected server error");
  }
}