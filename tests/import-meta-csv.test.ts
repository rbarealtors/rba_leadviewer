import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseMetaCsvFile,
  classifyParsedMetaRows,
  computeMetaImportSummary,
  buildCanonicalMetaLeadInsert,
  detectDelimiter,
  decodeFileContent,
  type ParsedMetaRow,
} from "../src/lib/leads/import-meta-csv";

describe("Meta Lead CSV / TSV Importer", () => {
  const recoveryFixturePath = path.join(__dirname, "fixtures", "shyamkunj_recovery.csv");

  describe("File Encoding & Delimiter Detection", () => {
    it("detects UTF-16LE BOM and decodes recovery fixture accurately", () => {
      const buffer = fs.readFileSync(recoveryFixturePath);
      const { text, encoding } = decodeFileContent(buffer);
      expect(encoding).toBe("utf-16le");
      expect(text.startsWith("id\tcreated_time") || text.startsWith("\uFEFFid\tcreated_time")).toBe(true);
    });

    it("detects tab delimiter on recovery fixture", () => {
      const buffer = fs.readFileSync(recoveryFixturePath);
      const { text } = decodeFileContent(buffer);
      const firstLine = text.split(/\r?\n/)[0]!;
      expect(detectDelimiter(firstLine)).toBe("\t");
    });

    it("detects comma delimiter on standard CSV header", () => {
      const header = "id,created_time,full_name,phone,campaign_name";
      expect(detectDelimiter(header)).toBe(",");
    });
  });

  describe("Parsing the Real 31-Lead Recovery File", () => {
    it("parses all 31 rows without corruption or missing records", () => {
      const buffer = fs.readFileSync(recoveryFixturePath);
      const result = parseMetaCsvFile(buffer, "shyamkunj_recovery.csv");

      expect(result.error).toBeUndefined();
      expect(result.encoding).toBe("utf-16le");
      expect(result.delimiter).toBe("\t");
      expect(result.totalRows).toBe(31);
      expect(result.validRows).toHaveLength(31);
      expect(result.invalidRows).toHaveLength(0);
    });

    it("extracts and normalizes row fields correctly from recovery file", () => {
      const buffer = fs.readFileSync(recoveryFixturePath);
      const result = parseMetaCsvFile(buffer);

      const row1 = result.validRows[0]!;
      expect(row1.externalLeadId).toBe("l:2286928275485209");
      expect(row1.fullName).toBe("Bnta Grg");
      expect(row1.phoneNumber).toBe("+917384336338"); // p: stripped
      expect(row1.platform).toBe("instagram"); // ig mapped
      expect(row1.campaignName).toBe("Shyam Kunj");
      expect(row1.adGroupName).toBe("shyamkunj_07august2026");
      expect(row1.adName).toBe("shyamkunj_07august2026");
      expect(row1.rawPayload).toBeDefined();
      expect(row1.rawPayload["id"]).toBe("l:2286928275485209");

      const row2 = result.validRows[1]!;
      expect(row2.externalLeadId).toBe("l:1850108879307772");
      expect(row2.fullName).toBe("Bikash Pradhan");
      expect(row2.phoneNumber).toBe("+919242732348");
      expect(row2.platform).toBe("facebook"); // fb mapped
    });
  });

  describe("RFC 4180 UTF-8 CSV Parsing", () => {
    it("parses standard UTF-8 comma-separated CSV with quotes and commas inside cells", () => {
      const csv = `id,created_time,full_name,phone,campaign_name,adset_name,platform
1001,2026-09-20T10:00:00Z,"Sharma, Amit",p:+919876543210,"Green, Park Phase 1",AdsetA,fb
1002,2026-09-20T11:00:00Z,Pooja Roy,+919876543211,Urban Nest,AdsetB,ig`;

      const result = parseMetaCsvFile(csv, "standard.csv");
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toHaveLength(2);

      const r1 = result.validRows[0]!;
      expect(r1.externalLeadId).toBe("1001");
      expect(r1.fullName).toBe("Sharma, Amit");
      expect(r1.phoneNumber).toBe("+919876543210");
      expect(r1.campaignName).toBe("Green, Park Phase 1");
      expect(r1.platform).toBe("facebook");
    });
  });

  describe("Validation and Malformed Rows", () => {
    it("returns an error if Meta Lead ID column is absent", () => {
      const csv = `created_time,full_name,phone,campaign_name\n2026-09-20,Amit,+919876543210,Urban Nest`;
      const result = parseMetaCsvFile(csv);
      expect(result.error).toBe("The CSV is missing the Meta Lead ID column required for safe deduplication.");
      expect(result.validRows).toHaveLength(0);
    });

    it("marks row invalid if phone number is completely missing", () => {
      const csv = `id,created_time,full_name,phone\n101,2026-09-20,Amit,`;
      const result = parseMetaCsvFile(csv);
      expect(result.invalidRows).toHaveLength(1);
      expect(result.invalidRows[0]!.error).toBe("Missing or invalid phone number");
    });

    it("detects intra-file duplicate Meta Lead IDs and flags subsequent rows as invalid", () => {
      const csv = `id,created_time,full_name,phone\n101,2026-09-20,Amit,+919876543210\n101,2026-09-20,Amit Duplicate,+919876543210`;
      const result = parseMetaCsvFile(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.invalidRows).toHaveLength(1);
      expect(result.invalidRows[0]!.error).toContain("Duplicate Meta Lead ID in file (101)");
    });
  });

  describe("Deduplication & Classification Engine", () => {
    const mockRows: ParsedMetaRow[] = [
      {
        rowNumber: 1,
        rawId: "l:1001",
        externalLeadId: "l:1001",
        fullName: "Rahul Verma",
        phoneNumber: "+919876500001",
        email: null,
        campaignName: "Shyam Kunj",
        campaignId: "c:1",
        adGroupName: "Adset 1",
        adsetName: "Adset 1",
        adName: "Ad 1",
        formId: "f:1",
        formName: "Form 1",
        platform: "facebook",
        sourceSubmittedAt: "2026-09-20T00:00:00.000Z",
        rawPayload: { id: "l:1001" },
        isValid: true,
      },
      {
        rowNumber: 2,
        rawId: "l:1002",
        externalLeadId: "l:1002",
        fullName: "Afrin Rahaman",
        phoneNumber: "+919876500002", // Phone collision with prior lead
        email: null,
        campaignName: "Shyam Kunj",
        campaignId: "c:1",
        adGroupName: "Adset 1",
        adsetName: "Adset 1",
        adName: "Ad 1",
        formId: "f:1",
        formName: "Form 1",
        platform: "instagram",
        sourceSubmittedAt: "2026-09-20T01:00:00.000Z",
        rawPayload: { id: "l:1002" },
        isValid: true,
      },
      {
        rowNumber: 3,
        rawId: "l:1003",
        externalLeadId: "l:1003", // ID collision (already in CRM)
        fullName: "Dipali Roy",
        phoneNumber: "+919876500003",
        email: null,
        campaignName: "Shyam Kunj",
        campaignId: "c:1",
        adGroupName: "Adset 1",
        adsetName: "Adset 1",
        adName: "Ad 1",
        formId: "f:1",
        formName: "Form 1",
        platform: "facebook",
        sourceSubmittedAt: "2026-09-20T02:00:00.000Z",
        rawPayload: { id: "l:1003" },
        isValid: true,
      },
    ];

    it("classifies rows dynamically based on existing CRM leads snapshot", () => {
      const existingDbLeads = [
        // Lead with matching ID
        {
          id: "uuid-1003",
          external_lead_id: "l:1003",
          phone_number: "+919876500003",
          campaign_name: "Urban Nest",
          source: "meta_ads",
        },
        // Lead with matching phone, but DIFFERENT ID
        {
          id: "uuid-prior-phone",
          external_lead_id: "l:9999",
          phone_number: "+919876500002",
          campaign_name: "Urban Nest",
          source: "meta_ads",
        },
      ];

      const analyzed = classifyParsedMetaRows(mockRows, existingDbLeads);
      expect(analyzed).toHaveLength(3);

      // Row 1: Brand new
      expect(analyzed[0]!.status).toBe("NEW");
      expect(analyzed[0]!.externalLeadId).toBe("l:1001");

      // Row 2: Repeat Inquirer (different Meta Lead ID, existing phone)
      expect(analyzed[1]!.status).toBe("REPEAT_INQUIRER");
      expect(analyzed[1]!.externalLeadId).toBe("l:1002");
      expect(analyzed[1]!.matchedLead?.campaign_name).toBe("Urban Nest");

      // Row 3: Already in CRM (exact Meta Lead ID match)
      expect(analyzed[2]!.status).toBe("ALREADY_IN_CRM");
      expect(analyzed[2]!.externalLeadId).toBe("l:1003");

      const summary = computeMetaImportSummary(analyzed);
      expect(summary.totalRows).toBe(3);
      expect(summary.newCount).toBe(1);
      expect(summary.repeatInquirerCount).toBe(1);
      expect(summary.alreadyInCrmCount).toBe(1);
      expect(summary.invalidCount).toBe(0);
    });

    it("matches external_lead_id with or without 'l:' prefix seamlessly", () => {
      const existingDbLeads = [
        {
          id: "uuid-test",
          external_lead_id: "1001", // DB without prefix
          phone_number: "+919876500001",
          campaign_name: "Test",
          source: "meta_ads",
        },
      ];

      // Row in CSV has "l:1001"
      const analyzed = classifyParsedMetaRows([mockRows[0]!], existingDbLeads);
      expect(analyzed[0]!.status).toBe("ALREADY_IN_CRM");
    });
  });

  describe("Canonical Lead Record Construction", () => {
    it("builds a canonical lead insert object matching public.leads schema", () => {
      const row: ParsedMetaRow = {
        rowNumber: 1,
        rawId: "l:2286928275485209",
        externalLeadId: "l:2286928275485209",
        fullName: "Bnta Grg",
        phoneNumber: "+917384336338",
        email: null,
        campaignName: "shyam kunj",
        campaignId: "c:120244963637970269",
        adGroupName: "shyamkunj_07august2026",
        adsetName: "shyamkunj_07august2026",
        adName: "shyamkunj_07august2026",
        formId: "f:1565341405114674",
        formName: "Shyam Kunj",
        platform: "instagram",
        sourceSubmittedAt: "2026-09-20T21:24:14.000Z",
        rawPayload: { original_col: "value" },
        isValid: true,
      };

      const analyzed = {
        ...row,
        status: "REPEAT_INQUIRER" as const,
      };

      const lead = buildCanonicalMetaLeadInsert(analyzed, "Shyam Kunj Mapped");
      expect(lead.source).toBe("meta_ads");
      expect(lead.external_lead_id).toBe("l:2286928275485209");
      expect(lead.full_name).toBe("Bnta Grg");
      expect(lead.phone_number).toBe("+917384336338");
      expect(lead.campaign_name).toBe("Shyam Kunj Mapped");
      expect(lead.ad_group_name).toBe("shyamkunj_07august2026");
      expect(lead.platform).toBe("instagram");
      expect(lead.lead_stage).toBe("NEW");
      expect(lead.needs_staff_review).toBe(true); // flagged because REPEAT_INQUIRER
      expect(lead.crm_disposition).toBe("Not Contacted");
      expect(lead.raw_payload).toEqual({ original_col: "value" });
    });
  });
});

