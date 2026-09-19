import { describe, expect, it } from "vitest";
import {
  escapeCsvCell,
  formatISTFull,
  formatLeadSource,
  generateLeadsCsv,
  EXPORT_HEADERS,
} from "../src/lib/leads/export-csv";
import type { Lead } from "../src/lib/leads/types";
import type { SalesRep } from "../src/app/leads/assignment-actions";

describe("CSV Export Utilities", () => {
  describe("escapeCsvCell", () => {
    it("returns empty string for null and undefined", () => {
      expect(escapeCsvCell(null)).toBe("");
      expect(escapeCsvCell(undefined)).toBe("");
    });

    it("leaves standard text untouched", () => {
      expect(escapeCsvCell("John Doe")).toBe("John Doe");
      expect(escapeCsvCell("Flat 302")).toBe("Flat 302");
    });

    it("preserves numbers without string quotation", () => {
      expect(escapeCsvCell(50000)).toBe("50000");
      expect(escapeCsvCell(0)).toBe("0");
    });

    it("quotes strings containing commas", () => {
      expect(escapeCsvCell("Sharma, Rajesh")).toBe('"Sharma, Rajesh"');
      expect(escapeCsvCell("₹80L, ₹1.2Cr")).toBe('"₹80L, ₹1.2Cr"');
    });

    it("escapes internal double quotes by doubling them", () => {
      expect(escapeCsvCell('He said "interested"')).toBe('"He said ""interested"""');
    });

    it("quotes strings with newlines", () => {
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(escapeCsvCell("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
    });

    it("protects against CSV/formula injection for =, +, -, @", () => {
      expect(escapeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(escapeCsvCell("-2+3*cmd")).toBe("'-2+3*cmd");
      expect(escapeCsvCell("@hyperlink")).toBe("'@hyperlink");
      // Phone numbers starting with +
      expect(escapeCsvCell("+919876543210")).toBe("'+919876543210");
    });

    it("quotes formula-escaped cells if they also contain commas", () => {
      expect(escapeCsvCell("=1+1, 2")).toBe("\"'=1+1, 2\"");
    });
  });

  describe("formatISTFull", () => {
    it("returns empty string for null or empty", () => {
      expect(formatISTFull(null)).toBe("");
      expect(formatISTFull("")).toBe("");
    });

    it("formats UTC timestamp to Indian Standard Time with Year", () => {
      // 2026-09-19T04:45:00.000Z is 10:15 AM in IST (UTC +05:30)
      const res = formatISTFull("2026-09-19T04:45:00.000Z");
      expect(res).toContain("19");
      expect(res).toContain("Sep");
      expect(res).toContain("2026");
      expect(res).toMatch(/10:15/i);
    });
  });

  describe("formatLeadSource", () => {
    it("maps recognized source slugs to titles", () => {
      expect(formatLeadSource("google_ads")).toBe("Google Ads");
      expect(formatLeadSource("meta_ads")).toBe("Meta Ads");
      expect(formatLeadSource("99acres")).toBe("99acres");
      expect(formatLeadSource("magicbricks")).toBe("MagicBricks");
      expect(formatLeadSource("direct_walk_in")).toBe("Direct Walk-in");
    });

    it("returns raw source if unrecognized", () => {
      expect(formatLeadSource("newspaper_ad")).toBe("newspaper_ad");
    });
  });

  describe("generateLeadsCsv", () => {
    const mockSalesTeam: SalesRep[] = [
      { id: "rep-1", full_name: "Amit Verma", email: "amit@example.com" },
      { id: "rep-2", full_name: "Priya Sharma", email: "priya@example.com" },
    ];

    const mockLeads: Lead[] = [
      {
        id: "lead-1",
        external_lead_id: "ext-101",
        source: "google_ads",
        full_name: "Rajesh Sharma",
        phone_number: "+919876543210",
        email: "rajesh@example.com",
        campaign_name: "Eden Estate, Phase 1",
        ad_group_name: "3 BHK Luxury",
        ad_name: "Search Ad 1",
        budget_range: "₹1.5 Cr - ₹2 Cr",
        bhk_configuration: "3 BHK",
        planning_timeline: "Immediate",
        platform: null,
        source_submitted_at: "2026-09-19T04:45:00.000Z",
        created_at: "2026-09-19T04:45:00.000Z",
        viewed_at: "2026-09-19T05:00:00.000Z",
        assigned_to: "rep-1",
        assigned_at: "2026-09-19T04:50:00.000Z",
        lead_status: "contacted",
        disposition: "Connected",
        disposition_details: { notes: "Wants high floor unit, sea facing" },
        next_follow_up: "2026-09-22T08:30:00.000Z",
        lead_stage: "SITE_VISIT",
        token_amount: 50000,
        closed_at: null,
        needs_staff_review: false,
        raw_payload: { complex: "internal data that must not appear in export" },
      },
      {
        id: "lead-2",
        external_lead_id: "ext-102",
        source: "meta_ads",
        full_name: "=MaliciousFormula()",
        phone_number: "p:9876500000",
        email: null,
        campaign_name: "Green Valley",
        ad_group_name: null,
        ad_name: null,
        budget_range: null,
        bhk_configuration: null,
        planning_timeline: null,
        platform: "facebook",
        source_submitted_at: "2026-09-18T10:00:00.000Z",
        created_at: "2026-09-18T10:00:00.000Z",
        viewed_at: null,
        assigned_to: null,
        assigned_at: null,
        lead_status: null,
        disposition: null,
        disposition_details: null,
        next_follow_up: null,
        lead_stage: "NEW",
        token_amount: null,
        closed_at: null,
        needs_staff_review: true,
        raw_payload: {},
      },
    ];

    it("starts with UTF-8 BOM (\\uFEFF)", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      expect(csv.startsWith("\uFEFF")).toBe(true);
    });

    it("contains all expected column headers in row 1", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      const lines = csv.replace("\uFEFF", "").split("\r\n");
      const headers = (lines[0] || "").split(",");
      expect(headers.length).toBe(EXPORT_HEADERS.length);
      expect(headers[0]).toBe("Lead ID");
      expect(headers).toContain("Lead Stage");
      expect(headers).toContain("Assigned Agent");
      expect(headers).not.toContain("raw_payload");
      expect(headers).not.toContain("crm_disposition");
    });

    it("correctly maps sales rep name and canonical lead stage", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      expect(csv).toContain("Amit Verma");
      expect(csv).toContain("SITE_VISIT");
      expect(csv).toContain("Unassigned");
      expect(csv).toContain("NEW");
    });

    it("neutralizes formula injection in lead name", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      // Lead 2 full_name is =MaliciousFormula() which must become '=MaliciousFormula()
      expect(csv).toContain("=MaliciousFormula()");
      expect(csv).toMatch(/'=MaliciousFormula\(\)/);
    });

    it("handles commas inside fields with quotes", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      // Campaign name is "Eden Estate, Phase 1"
      expect(csv).toContain('"Eden Estate, Phase 1"');
      // Notes is "Wants high floor unit, sea facing"
      expect(csv).toContain('"Wants high floor unit, sea facing"');
    });

    it("does not leak raw_payload JSON into the CSV", () => {
      const csv = generateLeadsCsv(mockLeads, mockSalesTeam);
      expect(csv).not.toContain("internal data that must not appear");
    });
  });
});

