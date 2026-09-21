"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/authorization";
import {
  parseMetaCsvFile,
  classifyParsedMetaRows,
  computeMetaImportSummary,
  buildCanonicalMetaLeadInsert,
  type AnalyzedMetaRow,
  type MetaImportSummary,
  type ParsedMetaRow,
} from "@/lib/leads/import-meta-csv";
import { resolveGoogleCampaignName, resolvePropertyName } from "@/lib/leads/google-ads-map";
import { revalidatePath } from "next/cache";

export interface PreviewResult {
  filename: string;
  encoding: string;
  delimiter: string;
  totalRows: number;
  summary: MetaImportSummary;
  rows: AnalyzedMetaRow[];
}

export interface ImportExecutionResult {
  success: boolean;
  totalRequested: number;
  createdCount: number;
  alreadyExistedCount: number;
  failedCount: number;
  errors: string[];
  createdLeadIds: string[];
}

/**
 * Server Action: Validates and parses the uploaded Meta CSV file,
 * cross-references against existing leads in public.leads, and returns a detailed preview.
 * Does NOT write any leads to the database.
 */
export async function previewMetaCsvAction(formData: FormData): Promise<{
  data: PreviewResult | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    requireAdminUser(user);

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { data: null, error: "Please upload a valid CSV file." };
    }

    if (file.size > 20 * 1024 * 1024) {
      return { data: null, error: "File size exceeds 20MB limit." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const parseResult = parseMetaCsvFile(arrayBuffer, file.name);

    if (parseResult.error) {
      return { data: null, error: parseResult.error };
    }

    if (parseResult.allRows.length === 0) {
      return { data: null, error: "No data rows found in the uploaded file." };
    }

    // Extract all external lead IDs and phone numbers for batch lookup
    const externalIdsToCheck = new Set<string>();
    const phoneNumbersToCheck = new Set<string>();

    for (const row of parseResult.validRows) {
      if (row.externalLeadId) {
        externalIdsToCheck.add(row.externalLeadId);
        // Also check without prefix if it starts with l:
        if (row.externalLeadId.startsWith("l:")) {
          externalIdsToCheck.add(row.externalLeadId.slice(2));
        } else {
          externalIdsToCheck.add(`l:${row.externalLeadId}`);
        }
      }
      if (row.phoneNumber) {
        phoneNumbersToCheck.add(row.phoneNumber);
      }
    }

    // Query existing leads from database
    const admin = createSupabaseAdminClient();
    const idList = Array.from(externalIdsToCheck);
    const phoneList = Array.from(phoneNumbersToCheck);

    const [idMatchesRes, phoneMatchesRes] = await Promise.all([
      idList.length > 0
        ? admin
            .from("leads")
            .select("id, external_lead_id, full_name, phone_number, campaign_name, source")
            .in("external_lead_id", idList)
        : Promise.resolve({ data: [] }),
      phoneList.length > 0
        ? admin
            .from("leads")
            .select("id, external_lead_id, full_name, phone_number, campaign_name, source")
            .in("phone_number", phoneList)
        : Promise.resolve({ data: [] }),
    ]);

    const existingLeadsMap = new Map<string, any>();
    for (const l of (idMatchesRes.data || []) as any[]) {
      existingLeadsMap.set(l.id, l);
    }
    for (const l of (phoneMatchesRes.data || []) as any[]) {
      existingLeadsMap.set(l.id, l);
    }

    const existingLeadsList = Array.from(existingLeadsMap.values());

    // Classify rows dynamically
    const analyzedRows = classifyParsedMetaRows(parseResult.allRows, existingLeadsList);

    // Resolve campaign names
    for (const row of analyzedRows) {
      const rawCampaign = row.campaignName || row.campaignId;
      if (rawCampaign) {
        const resolved =
          (await resolveGoogleCampaignName(rawCampaign)) ||
          (await resolvePropertyName(rawCampaign));
        if (resolved && resolved !== rawCampaign) {
          row.campaignName = resolved;
        }
      }
    }

    const summary = computeMetaImportSummary(analyzedRows);

    return {
      data: {
        filename: file.name,
        encoding: parseResult.encoding,
        delimiter: parseResult.delimiter,
        totalRows: parseResult.totalRows,
        summary,
        rows: analyzedRows,
      },
      error: null,
    };
  } catch (err: any) {
    console.error("previewMetaCsvAction error:", err);
    return { data: null, error: err?.message || "Failed to process CSV file." };
  }
}

/**
 * Server Action: Confirms and inserts the selected Meta leads into public.leads.
 * Re-validates deduplication immediately before insertion to eliminate race conditions.
 */
export async function executeMetaImportAction(params: {
  rowsToImport: ParsedMetaRow[];
  filename: string;
}): Promise<{
  data: ImportExecutionResult | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const adminUser = requireAdminUser(user);

    const { rowsToImport, filename } = params;
    if (!rowsToImport || rowsToImport.length === 0) {
      return { data: null, error: "No leads selected for import." };
    }

    const admin = createSupabaseAdminClient();

    // 1. Re-check database deduplication immediately before insertion
    const externalIds = rowsToImport.map((r) => r.externalLeadId).filter(Boolean);
    const idCheckList: string[] = [];
    for (const id of externalIds) {
      idCheckList.push(id);
      if (id.startsWith("l:")) idCheckList.push(id.slice(2));
      else idCheckList.push(`l:${id}`);
    }

    const { data: existingRecords } = await admin
      .from("leads")
      .select("external_lead_id")
      .eq("source", "meta_ads")
      .in("external_lead_id", idCheckList);

    const alreadyInDb = new Set<string>();
    for (const rec of existingRecords || []) {
      if (rec.external_lead_id) {
        alreadyInDb.add(rec.external_lead_id);
        if (rec.external_lead_id.startsWith("l:")) {
          alreadyInDb.add(rec.external_lead_id.slice(2));
        } else {
          alreadyInDb.add(`l:${rec.external_lead_id}`);
        }
      }
    }

    // Check phone collisions to set needs_staff_review accurately
    const phones = rowsToImport.map((r) => r.phoneNumber).filter(Boolean) as string[];
    const { data: phoneRecords } = await admin
      .from("leads")
      .select("phone_number")
      .in("phone_number", phones);

    const existingPhones = new Set<string>(
      (phoneRecords || []).map((p) => p.phone_number).filter(Boolean)
    );

    const toInsert: Record<string, unknown>[] = [];
    let alreadyExistedCount = 0;
    const errors: string[] = [];

    for (const row of rowsToImport) {
      if (!row.isValid || !row.externalLeadId) {
        errors.push(`Row ${row.rowNumber} skipped: ${row.error || "Invalid data"}`);
        continue;
      }

      // Check if lead already entered DB
      if (alreadyInDb.has(row.externalLeadId)) {
        alreadyExistedCount++;
        continue;
      }

      // Resolve campaign name
      const rawCamp = row.campaignName || row.campaignId;
      const resolvedCampaign = rawCamp
        ? (await resolveGoogleCampaignName(rawCamp)) || (await resolvePropertyName(rawCamp)) || rawCamp
        : null;

      const isRepeatInquirer = row.phoneNumber ? existingPhones.has(row.phoneNumber) : false;

      const leadPayload = {
        source: "meta_ads",
        external_lead_id: row.externalLeadId,
        full_name: row.fullName,
        phone_number: row.phoneNumber,
        email: row.email,
        campaign_name: resolvedCampaign,
        ad_group_name: row.adGroupName,
        ad_name: row.adName,
        budget_range: null,
        bhk_configuration: null,
        planning_timeline: null,
        platform: row.platform,
        source_submitted_at: row.sourceSubmittedAt,
        lead_stage: "NEW",
        lead_status: "unassigned",
        needs_staff_review: isRepeatInquirer,
        crm_disposition: "Not Contacted",
        raw_payload: row.rawPayload,
      };

      toInsert.push(leadPayload);
    }

    let createdCount = 0;
    let failedCount = 0;
    const createdLeadIds: string[] = [];

    // Batch insert in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      const { data, error } = await admin
        .from("leads")
        .insert(chunk)
        .select("id, external_lead_id");

      if (error) {
        // If unique violation occurred due to concurrent insert
        if (error.code === "23505") {
          console.warn("Concurrent duplicate detected during batch insert:", error.message);
          alreadyExistedCount += chunk.length;
        } else {
          console.error("Batch insert error:", error);
          failedCount += chunk.length;
          errors.push(`Failed to insert batch: ${error.message}`);
        }
      } else if (data) {
        createdCount += data.length;
        for (const inserted of data) {
          createdLeadIds.push(inserted.id);
        }
      }
    }

    // 2. Log to public.lead_imports audit table (graceful fallback if table does not exist)
    try {
      await admin.from("lead_imports").insert({
        filename,
        source: "meta_ads",
        uploaded_by: adminUser.id,
        uploaded_by_email: adminUser.email,
        total_rows: rowsToImport.length,
        created_count: createdCount,
        existing_count: alreadyExistedCount,
        skipped_count: rowsToImport.length - createdCount - failedCount,
        error_count: failedCount,
        summary: {
          requestedCount: rowsToImport.length,
          createdCount,
          alreadyExistedCount,
          failedCount,
        },
      });
    } catch (auditErr) {
      console.warn("Could not log import audit record (lead_imports table may not exist yet):", auditErr);
    }

    revalidatePath("/leads");

    return {
      data: {
        success: true,
        totalRequested: rowsToImport.length,
        createdCount,
        alreadyExistedCount,
        failedCount,
        errors,
        createdLeadIds,
      },
      error: null,
    };
  } catch (err: any) {
    console.error("executeMetaImportAction error:", err);
    return { data: null, error: err?.message || "Failed to execute import." };
  }
}

