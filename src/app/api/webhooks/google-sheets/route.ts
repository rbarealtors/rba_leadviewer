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
  const webhookSecret = process.env.GOOGLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("google-sheets webhook: GOOGLE_WEBHOOK_SECRET is not configured");
    return jsonError(500, "Server misconfigured");
  }

  let payload: SheetsWebhookPayload;
  try {
    payload = (await request.json()) as SheetsWebhookPayload;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (payload.secret !== webhookSecret) {
    return jsonError(401, "Unauthorized");
  }

  if (typeof payload.lead !== "object" || payload.lead === null || Array.isArray(payload.lead)) {
    return jsonError(400, "Missing or invalid lead");
  }

  const lead = payload.lead as Record<string, unknown>;
  const serializedLead = JSON.stringify(lead);
  const externalLeadId = value(payload as Record<string, unknown>, "external_lead_id", "event_id")
    || value(lead, "id", "Lead ID", "lead_id")
    || createHash("sha256").update(serializedLead).digest("hex");

  const submittedAtCandidate = value(lead, "created_at", "Created At", "timestamp", "Timestamp");
  const parsedSubmittedAt = submittedAtCandidate ? new Date(submittedAtCandidate) : new Date();
  const sourceSubmittedAt = Number.isNaN(parsedSubmittedAt.getTime())
    ? new Date().toISOString()
    : parsedSubmittedAt.toISOString();

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("leads").insert({
      external_lead_id: externalLeadId,
      full_name: value(lead, "Full Name", "full_name", "Name") || "Unknown",
      phone_number: value(lead, "Phone Number", "phone_number", "Phone"),
      email: value(lead, "Email", "email"),
      source: "facebook_sheets_bridge",
      source_submitted_at: sourceSubmittedAt,
      raw_payload: lead,
    });

    if (error) {
      if (error.code === "23505") return NextResponse.json({ success: true });
      console.error("google-sheets webhook: insert failed", { code: error.code });
      return jsonError(500, "Could not persist lead");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("google-sheets webhook: unexpected error", error);
    return jsonError(500, "Unexpected server error");
  }
}