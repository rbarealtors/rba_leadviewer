import { normalizePhoneNumber } from "./phone";
import { mapPlatform } from "./normalize-meta";
import type { Lead, LeadPlatform, NormalizedLead } from "./types";

export type ImportRowStatus = "NEW" | "REPEAT_INQUIRER" | "ALREADY_IN_CRM" | "INVALID";

export interface ParsedMetaRow {
  rowNumber: number; // 1-based index (data row)
  rawId: string;
  externalLeadId: string;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adsetName: string | null;
  adName: string | null;
  formId: string | null;
  formName: string | null;
  platform: LeadPlatform;
  sourceSubmittedAt: string; // ISO 8601 UTC
  rawPayload: Record<string, unknown>;
  isValid: boolean;
  error?: string;
}

export interface AnalyzedMetaRow extends ParsedMetaRow {
  status: ImportRowStatus;
  statusReason?: string;
  matchedLead?: {
    id: string;
    external_lead_id: string;
    full_name?: string | null;
    campaign_name?: string | null;
    source?: string | null;
  };
}

export interface ParseMetaFileResult {
  filename: string;
  encoding: string;
  delimiter: string;
  totalRows: number;
  validRows: ParsedMetaRow[];
  invalidRows: ParsedMetaRow[];
  headers: string[];
  allRows: ParsedMetaRow[];
  error?: string;
}

export interface MetaImportSummary {
  totalRows: number;
  newCount: number;
  repeatInquirerCount: number;
  alreadyInCrmCount: number;
  invalidCount: number;
}

/**
 * Decodes an input file buffer or string into a UTF-8 string,
 * automatically detecting UTF-16LE, UTF-16BE, or UTF-8 Byte Order Marks (BOM).
 */
export function decodeFileContent(input: ArrayBuffer | Uint8Array | string): {
  text: string;
  encoding: string;
} {
  if (typeof input === "string") {
    // Strip leading UTF-8 BOM if present
    const cleaned = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    return { text: cleaned, encoding: "utf-8" };
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // UTF-16LE BOM
    const decoder = new TextDecoder("utf-16le");
    const decoded = decoder.decode(bytes);
    return { text: decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded, encoding: "utf-16le" };
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // UTF-16BE BOM
    const decoder = new TextDecoder("utf-16be");
    const decoded = decoder.decode(bytes);
    return { text: decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded, encoding: "utf-16be" };
  } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    // UTF-8 with BOM
    const decoder = new TextDecoder("utf-8");
    const decoded = decoder.decode(bytes.slice(3));
    return { text: decoded, encoding: "utf-8-bom" };
  }

  // Fallback to UTF-8
  const decoder = new TextDecoder("utf-8");
  const decoded = decoder.decode(bytes);
  return { text: decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded, encoding: "utf-8" };
}

/**
 * Detects whether the delimiter is Tab (\t), Comma (,), or Semicolon (;)
 * by inspecting the first line.
 */
export function detectDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;

  if (tabs > 0 && tabs >= commas && tabs >= semicolons) return "\t";
  if (commas >= semicolons && commas > 0) return ",";
  if (semicolons > 0) return ";";
  return ",";
}

/**
 * Parses RFC 4180 delimited text (supporting quoted cells with newlines and escaped quotes).
 */
export function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      insideQuotes = true;
      i++;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    if (char === "\r") {
      if (i + 1 < len && text[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Flush remaining field/row
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out empty trailing rows
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function cleanCell(val: string | undefined): string {
  if (!val) return "";
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/""/g, '"').trim();
  }
  return s;
}

/**
 * Parses a Meta Lead Ads CSV/TSV export into structured row objects.
 */
export function parseMetaCsvFile(
  input: ArrayBuffer | Uint8Array | string,
  filename = "meta-leads.csv"
): ParseMetaFileResult {
  const { text, encoding } = decodeFileContent(input);

  if (!text.trim()) {
    return {
      filename,
      encoding,
      delimiter: ",",
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      headers: [],
      allRows: [],
      error: "The uploaded file is empty.",
    };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      filename,
      encoding,
      delimiter: ",",
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      headers: [],
      allRows: [],
      error: "The uploaded file contains no data.",
    };
  }

  const delimiter = detectDelimiter(lines[0] || "");
  const parsedGrid = parseDelimitedText(text, delimiter);

  if (parsedGrid.length === 0) {
    return {
      filename,
      encoding,
      delimiter,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      headers: [],
      allRows: [],
      error: "Could not parse any rows from the file.",
    };
  }

  const rawHeaders = parsedGrid[0] || [];
  const normalizedHeaders = rawHeaders.map((h) => cleanCell(h).replace(/^\uFEFF/, "").toLowerCase());

  // Find column indices
  // Required: id / lead_id
  const idIndices = normalizedHeaders
    .map((h, i) => (/^(?:id|lead_?id)$/i.test(h) ? i : -1))
    .filter((i) => i !== -1);

  if (idIndices.length === 0) {
    return {
      filename,
      encoding,
      delimiter,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      headers: rawHeaders,
      allRows: [],
      error: "The CSV is missing the Meta Lead ID column required for safe deduplication.",
    };
  }

  const idIdx = idIndices[0]!;

  const getIndices = (regex: RegExp) =>
    normalizedHeaders.map((h, i) => (regex.test(h) ? i : -1)).filter((i) => i !== -1);

  const phoneIndices = getIndices(/^(?:phone|phone_?number|mobile|contact_?number)$/i);
  const fullNameIndices = getIndices(/^(?:full_?name|name)$/i);
  const firstNameIndices = getIndices(/^(?:first_?name)$/i);
  const lastNameIndices = getIndices(/^(?:last_?name)$/i);
  const emailIndices = getIndices(/^(?:email|email_?address)$/i);
  const createdTimeIndices = getIndices(/^(?:created_?time|created_?at|date|timestamp)$/i);
  const campaignNameIndices = getIndices(/^(?:campaign_?name)$/i);
  const campaignIdIndices = getIndices(/^(?:campaign_?id)$/i);
  const adsetNameIndices = getIndices(/^(?:adset_?name)$/i);
  const adNameIndices = getIndices(/^(?:ad_?name)$/i);
  const formIdIndices = getIndices(/^(?:form_?id)$/i);
  const formNameIndices = getIndices(/^(?:form_?name)$/i);
  const platformIndices = getIndices(/^(?:platform)$/i);

  const getValue = (row: string[], indices: number[]): string => {
    for (const idx of indices) {
      const val = cleanCell(row[idx]);
      if (val) return val;
    }
    return "";
  };

  const allRows: ParsedMetaRow[] = [];
  const validRows: ParsedMetaRow[] = [];
  const invalidRows: ParsedMetaRow[] = [];
  const seenIdsInFile = new Set<string>();

  for (let r = 1; r < parsedGrid.length; r++) {
    const row = parsedGrid[r]!;
    // Skip empty lines
    if (row.length === 1 && !row[0]?.trim()) continue;

    const rawId = cleanCell(row[idIdx]);
    const rawPhone = getValue(row, phoneIndices);
    const rawFullName = getValue(row, fullNameIndices);
    const rawFirstName = getValue(row, firstNameIndices);
    const rawLastName = getValue(row, lastNameIndices);
    const rawEmail = getValue(row, emailIndices);
    const rawCreatedTime = getValue(row, createdTimeIndices);
    const rawCampaignName = getValue(row, campaignNameIndices);
    const rawCampaignId = getValue(row, campaignIdIndices);
    const rawAdsetName = getValue(row, adsetNameIndices);
    const rawAdName = getValue(row, adNameIndices);
    const rawFormId = getValue(row, formIdIndices);
    const rawFormName = getValue(row, formNameIndices);
    const rawPlatform = getValue(row, platformIndices);

    // Build raw_payload dictionary preserving all original CSV header names and values
    const rawPayload: Record<string, unknown> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = cleanCell(rawHeaders[c]) || `column_${c}`;
      rawPayload[headerName] = cleanCell(row[c]);
    }

    // Name assembly
    let fullName: string | null = rawFullName || null;
    if (!fullName && (rawFirstName || rawLastName)) {
      fullName = `${rawFirstName} ${rawLastName}`.trim() || null;
    }

    // Phone normalization: strip p: and sanitize
    const cleanPhone = normalizePhoneNumber(rawPhone);

    // Platform mapping
    const platform = mapPlatform(rawPlatform);

    // Timestamp parsing
    let sourceSubmittedAt: string;
    if (rawCreatedTime) {
      const d = new Date(rawCreatedTime);
      sourceSubmittedAt = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } else {
      sourceSubmittedAt = new Date().toISOString();
    }

    // External Lead ID: preserve exact Meta format (e.g. l:2286928275485209)
    const externalLeadId = rawId.trim();

    const parsedRow: ParsedMetaRow = {
      rowNumber: r,
      rawId,
      externalLeadId,
      fullName,
      phoneNumber: cleanPhone,
      email: rawEmail || null,
      campaignName: rawCampaignName || null,
      campaignId: rawCampaignId || null,
      adGroupName: rawAdsetName || null,
      adsetName: rawAdsetName || null,
      adName: rawAdName || null,
      formId: rawFormId || null,
      formName: rawFormName || null,
      platform,
      sourceSubmittedAt,
      rawPayload,
      isValid: true,
    };

    // Validation
    if (!rawId) {
      parsedRow.isValid = false;
      parsedRow.error = "Missing Meta Lead ID";
      invalidRows.push(parsedRow);
    } else if (seenIdsInFile.has(externalLeadId)) {
      parsedRow.isValid = false;
      parsedRow.error = `Duplicate Meta Lead ID in file (${externalLeadId})`;
      invalidRows.push(parsedRow);
    } else if (!cleanPhone) {
      parsedRow.isValid = false;
      parsedRow.error = "Missing or invalid phone number";
      invalidRows.push(parsedRow);
    } else {
      seenIdsInFile.add(externalLeadId);
      validRows.push(parsedRow);
    }

    allRows.push(parsedRow);
  }

  return {
    filename,
    encoding,
    delimiter,
    totalRows: allRows.length,
    validRows,
    invalidRows,
    headers: rawHeaders,
    allRows,
  };
}

/**
 * Classifies parsed Meta rows against existing CRM leads snapshot.
 *
 * Rules:
 * 1. Invalid row -> INVALID
 * 2. Exact Meta Lead ID match in CRM -> ALREADY_IN_CRM (skipped on import)
 * 3. Phone number match in CRM (with different Meta Lead ID) -> REPEAT_INQUIRER (valid new lead, needs staff review)
 * 4. Neither ID nor phone exists in CRM -> NEW (valid new lead)
 */
export interface ExistingLeadSnapshot {
  id: string;
  external_lead_id: string;
  phone_number?: string | null;
  full_name?: string | null;
  campaign_name?: string | null;
  source?: string | null;
}

export function classifyParsedMetaRows(
  parsedRows: ParsedMetaRow[],
  existingLeads: ExistingLeadSnapshot[]
): AnalyzedMetaRow[] {
  // Index existing leads by external_lead_id (supporting both exact and with/without l: prefix)
  const existingIdMap = new Map<string, typeof existingLeads[0]>();
  for (const lead of existingLeads) {
    if (lead.external_lead_id) {
      const ext = lead.external_lead_id.trim();
      existingIdMap.set(ext, lead);
      // Also map without l: prefix or with l: prefix to ensure interoperability
      if (ext.startsWith("l:")) {
        existingIdMap.set(ext.slice(2), lead);
      } else {
        existingIdMap.set(`l:${ext}`, lead);
      }
    }
  }

  // Index existing leads by phone_number
  const existingPhoneMap = new Map<string, typeof existingLeads[0]>();
  for (const lead of existingLeads) {
    if (lead.phone_number) {
      const clean = normalizePhoneNumber(lead.phone_number);
      if (clean && !existingPhoneMap.has(clean)) {
        existingPhoneMap.set(clean, lead);
      }
    }
  }

  return parsedRows.map((row) => {
    if (!row.isValid) {
      return {
        ...row,
        status: "INVALID",
        statusReason: row.error || "Invalid row",
      };
    }

    // 1. Primary deduplication: Meta Lead ID
    const matchedById = existingIdMap.get(row.externalLeadId);
    if (matchedById) {
      return {
        ...row,
        status: "ALREADY_IN_CRM",
        statusReason: "Already exists in CRM with this Meta Lead ID",
        matchedLead: {
          id: matchedById.id,
          external_lead_id: matchedById.external_lead_id,
          full_name: matchedById.full_name || null,
          campaign_name: matchedById.campaign_name || null,
          source: matchedById.source || null,
        },
      };
    }

    // 2. Secondary duplicate check: Phone number
    const matchedByPhone = row.phoneNumber ? existingPhoneMap.get(row.phoneNumber) : undefined;
    if (matchedByPhone) {
      return {
        ...row,
        status: "REPEAT_INQUIRER",
        statusReason: `Repeat inquirer: Contact already exists in CRM (${matchedByPhone.campaign_name || "another campaign"})`,
        matchedLead: {
          id: matchedByPhone.id,
          external_lead_id: matchedByPhone.external_lead_id,
          full_name: matchedByPhone.full_name || null,
          campaign_name: matchedByPhone.campaign_name || null,
          source: matchedByPhone.source || null,
        },
      };
    }

    // 3. New lead
    return {
      ...row,
      status: "NEW",
      statusReason: "New lead ready for import",
    };
  });
}

/**
 * Computes summary counts dynamically from analyzed rows.
 */
export function computeMetaImportSummary(rows: AnalyzedMetaRow[]): MetaImportSummary {
  let newCount = 0;
  let repeatInquirerCount = 0;
  let alreadyInCrmCount = 0;
  let invalidCount = 0;

  for (const row of rows) {
    if (row.status === "NEW") newCount++;
    else if (row.status === "REPEAT_INQUIRER") repeatInquirerCount++;
    else if (row.status === "ALREADY_IN_CRM") alreadyInCrmCount++;
    else if (row.status === "INVALID") invalidCount++;
  }

  return {
    totalRows: rows.length,
    newCount,
    repeatInquirerCount,
    alreadyInCrmCount,
    invalidCount,
  };
}

/**
 * Builds a canonical lead record ready for insertion into `public.leads`.
 */
export function buildCanonicalMetaLeadInsert(
  row: AnalyzedMetaRow,
  resolvedCampaignName?: string | null
): Record<string, unknown> {
  return {
    source: "meta_ads",
    external_lead_id: row.externalLeadId,
    full_name: row.fullName,
    phone_number: row.phoneNumber,
    email: row.email,
    campaign_name: resolvedCampaignName || row.campaignName || null,
    ad_group_name: row.adGroupName || null,
    ad_name: row.adName || null,
    budget_range: null,
    bhk_configuration: null,
    planning_timeline: null,
    platform: row.platform,
    source_submitted_at: row.sourceSubmittedAt,
    lead_stage: "NEW",
    lead_status: "unassigned",
    needs_staff_review: row.status === "REPEAT_INQUIRER",
    crm_disposition: "Not Contacted",
    raw_payload: row.rawPayload,
  };
}

