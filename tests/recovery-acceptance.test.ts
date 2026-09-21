import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import {
  parseMetaCsvFile,
  classifyParsedMetaRows,
  computeMetaImportSummary,
  buildCanonicalMetaLeadInsert,
} from "../src/lib/leads/import-meta-csv";
import { resolveGoogleCampaignName, resolvePropertyName } from "../src/lib/leads/google-ads-map";

describe("Meta Recovery End-to-End Live Database Acceptance Test", () => {
  const fixturePath = path.join(__dirname, "fixtures", "shyamkunj_recovery.csv");
  const admin = createSupabaseAdminClient();

  it("completes full recovery lifecycle: parse -> dynamic preview -> import -> DB verify -> re-import idempotency", async () => {
    // 1. Read and parse recovery file
    const buffer = fs.readFileSync(fixturePath);
    const parsed = parseMetaCsvFile(buffer, "shyamkunj_07august2026_Leads_2026-09-17_2026-09-20.csv");

    expect(parsed.error).toBeUndefined();
    expect(parsed.totalRows).toBe(31);
    expect(parsed.validRows).toHaveLength(31);
    expect(parsed.invalidRows).toHaveLength(0);

    const leadIds = parsed.validRows.map((r) => r.externalLeadId);
    const phoneNumbers = parsed.validRows.map((r) => r.phoneNumber).filter(Boolean) as string[];

    // 2. Fetch current DB state for these IDs and phones
    const [existingByIdRes, existingByPhoneRes] = await Promise.all([
      admin
        .from("leads")
        .select("id, external_lead_id, phone_number, campaign_name, source, full_name")
        .in("external_lead_id", leadIds),
      admin
        .from("leads")
        .select("id, external_lead_id, phone_number, campaign_name, source, full_name")
        .in("phone_number", phoneNumbers),
    ]);

    const existingLeadsMap = new Map<string, any>();
    for (const l of (existingByIdRes.data || []) as any[]) existingLeadsMap.set(l.id, l);
    for (const l of (existingByPhoneRes.data || []) as any[]) existingLeadsMap.set(l.id, l);
    const initialDbSnapshot = Array.from(existingLeadsMap.values());

    // 3. Dynamic classification
    const previewRows = classifyParsedMetaRows(parsed.allRows, initialDbSnapshot);
    const initialSummary = computeMetaImportSummary(previewRows);

    console.log("Initial Dynamic Summary:", initialSummary);
    expect(initialSummary.totalRows).toBe(31);
    expect(initialSummary.invalidCount).toBe(0);

    // If leads are not in DB yet:
    if (initialSummary.alreadyInCrmCount === 0) {
      expect(initialSummary.newCount + initialSummary.repeatInquirerCount).toBe(31);
      expect(initialSummary.repeatInquirerCount).toBeGreaterThan(0);
      expect(initialSummary.newCount).toBeGreaterThan(0);
      expect(initialSummary.alreadyInCrmCount).toBe(0);

      // 4. Perform live import of all 31 leads
      const toInsert: Record<string, unknown>[] = [];
      for (const row of previewRows) {
        const rawCamp = row.campaignName || row.campaignId;
        const resolved = rawCamp
          ? (await resolveGoogleCampaignName(rawCamp)) || (await resolvePropertyName(rawCamp)) || rawCamp
          : null;
        toInsert.push(buildCanonicalMetaLeadInsert(row, resolved));
      }

      const { data: insertedData, error: insertError } = await admin
        .from("leads")
        .insert(toInsert)
        .select("id, external_lead_id, needs_staff_review, lead_stage, source, campaign_name, phone_number");

      expect(insertError).toBeNull();
      expect(insertedData).toHaveLength(31);

      // Verify attributes
      const repeatInquirers = insertedData!.filter((l) => l.needs_staff_review);
      const newContacts = insertedData!.filter((l) => !l.needs_staff_review);

      expect(repeatInquirers.length + newContacts.length).toBe(31);
      expect(repeatInquirers.length).toBe(initialSummary.repeatInquirerCount);
      expect(newContacts.length).toBe(initialSummary.newCount);
      for (const lead of insertedData!) {
        expect(lead.source).toBe("meta_ads");
        expect(lead.lead_stage).toBe("NEW");
        expect(lead.campaign_name).toBeDefined();
      }
    }

    // 5. Mandatory Re-import / Idempotency Test
    // Fetch updated DB state
    const { data: postImportLeads } = await admin
      .from("leads")
      .select("id, external_lead_id, phone_number, campaign_name, source, full_name")
      .in("external_lead_id", leadIds);

    expect(postImportLeads).toHaveLength(31);

    // Run preview again against the updated DB state
    const reimportRows = classifyParsedMetaRows(parsed.allRows, postImportLeads || []);
    const reimportSummary = computeMetaImportSummary(reimportRows);

    console.log("Re-import Summary:", reimportSummary);
    expect(reimportSummary.totalRows).toBe(31);
    expect(reimportSummary.newCount).toBe(0);
    expect(reimportSummary.repeatInquirerCount).toBe(0);
    expect(reimportSummary.alreadyInCrmCount).toBe(31);
    expect(reimportSummary.invalidCount).toBe(0);
  }, 30000);
});
