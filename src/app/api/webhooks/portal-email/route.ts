import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parse99AcresEmail } from "@/lib/leads/email-parser-99acres";
import { parseMagicBricksEmail } from "@/lib/leads/email-parser-magicbricks";
import type { LeadSource } from "@/lib/leads/types";

interface PortalEmailPayload {
  secret?: unknown;
  from?: unknown;
  subject?: unknown;
  body?: unknown;
  date?: unknown;
  timestamp?: unknown;
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Verify secret against PORTAL_WEBHOOK_SECRET or SHEETS_WEBHOOK_SECRET (or META_SHEETS_WEBHOOK_SECRET)
  const configuredSecret =
    process.env.PORTAL_WEBHOOK_SECRET ||
    process.env.SHEETS_WEBHOOK_SECRET ||
    process.env.META_SHEETS_WEBHOOK_SECRET;

  if (!configuredSecret) {
    console.error("portal-email webhook: neither PORTAL_WEBHOOK_SECRET nor SHEETS_WEBHOOK_SECRET is configured");
    return jsonError(500, "Server misconfigured");
  }

  let payload: PortalEmailPayload;
  try {
    payload = (await request.json()) as PortalEmailPayload;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (!payload || typeof payload !== "object") {
    return jsonError(400, "Invalid payload object");
  }

  if (payload.secret !== configuredSecret) {
    return jsonError(401, "Unauthorized");
  }

  if (typeof payload.body !== "string" || !payload.body.trim()) {
    return jsonError(400, "Missing or invalid body");
  }

  const emailBody = payload.body;
  const emailSubject = typeof payload.subject === "string" ? payload.subject : undefined;
  const emailFrom = typeof payload.from === "string" ? payload.from : undefined;

  const emailBodyStr = emailBody.toLowerCase();
  const emailSubjectStr = (emailSubject || "").toLowerCase();

  const skipKeywords = [
    "photos deleted",
    "listing expired",
    "invoice",
    "verification",
    "screening",
  ];

  for (const keyword of skipKeywords) {
    if (emailSubjectStr.includes(keyword) || emailBodyStr.includes(keyword)) {
      return NextResponse.json({ success: true, message: "Skipped non-lead system notification" }, { status: 200 });
    }
  }

  // Detect whether the notification is from MagicBricks or 99acres
  const isMagicBricks =
    (Boolean(emailFrom) && emailFrom!.toLowerCase().includes("magicbricks.com")) ||
    emailBody.toLowerCase().includes("magicbricks") ||
    (Boolean(emailSubject) && emailSubject!.toLowerCase().includes("magicbricks"));
    emailBodyStr.includes("magicbricks") ||
    emailSubjectStr.includes("magicbricks");

  const source: LeadSource = isMagicBricks ? "magicbricks" : "99acres";
  const parsed = isMagicBricks
    ? parseMagicBricksEmail(emailBody, emailSubject)
    : parse99AcresEmail(emailBody, emailSubject);

  if (!parsed.phone_number || parsed.phone_number.trim() === "") {
    return NextResponse.json(
      { success: true, message: "Ignored non-lead / system notification email" },
      { status: 200 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    let submittedAt = new Date().toISOString();
    const incomingDate =
      typeof payload.date === "string" && payload.date.trim()
        ? payload.date.trim()
        : typeof payload.timestamp === "string" && payload.timestamp.trim()
        ? payload.timestamp.trim()
        : null;

    if (incomingDate) {
      const parsedDate = new Date(incomingDate);
      if (!isNaN(parsedDate.getTime())) {
        submittedAt = parsedDate.toISOString();
      }
    }

    const { error } = await supabase.from("leads").insert({
      external_lead_id: parsed.external_lead_id,
      full_name: parsed.full_name || null,
      phone_number: parsed.phone_number || null,
      email: parsed.email || null,
      campaign_name: parsed.campaign_name || null,
      ad_group_name: null,
      ad_name: parsed.property_id ? `Property ${parsed.property_id}` : null,
      budget_range: parsed.budget_range || null,
      bhk_configuration: parsed.bhk_configuration || null,
      planning_timeline: null,
      source,
      source_submitted_at: submittedAt,
      raw_payload: {
        from: emailFrom,
        subject: emailSubject,
        body: emailBody,
        parsed,
      },
    });

    if (error) {
      // Postgres unique_violation (code 23505) means this lead has already been recorded.
      // Treat this as an idempotent success per webhook semantics.
      if (error.code === "23505") {
        return NextResponse.json({ success: true, duplicate: true, lead_id: parsed.external_lead_id });
      }
      console.error("portal-email webhook: insert failed", error);
      return jsonError(500, "Could not persist lead");
    }

    return NextResponse.json({
      success: true,
      lead_id: parsed.external_lead_id,
      source,
      lead: {
        full_name: parsed.full_name,
        phone_number: parsed.phone_number,
        campaign_name: parsed.campaign_name,
        bhk_configuration: parsed.bhk_configuration,
        budget_range: parsed.budget_range,
      },
    });
  } catch (err) {
    console.error("portal-email webhook: unexpected error", err);
    return jsonError(500, "Unexpected server error");
  }
}
