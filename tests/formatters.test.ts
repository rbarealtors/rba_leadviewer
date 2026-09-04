import { describe, it, expect } from "vitest";
import {
  sanitizePhoneForWhatsApp,
  sanitizePhoneForCopy,
  buildWhatsAppUrl,
  formatCampaignName,
} from "../src/lib/leads/formatters";

describe("sanitizePhoneForWhatsApp", () => {
  it("formats a standard 10-digit Indian number by prepending 91", () => {
    expect(sanitizePhoneForWhatsApp("9834500000")).toBe("919834500000");
  });

  it("handles numbers with +91 country code prefix", () => {
    expect(sanitizePhoneForWhatsApp("+919834500000")).toBe("919834500000");
  });

  it("handles numbers with spaces, dashes, and parentheses", () => {
    expect(sanitizePhoneForWhatsApp("+91 (9834) 500-000")).toBe("919834500000");
  });

  it("handles numbers with Meta 'p:' transport prefix", () => {
    expect(sanitizePhoneForWhatsApp("p:9834500000")).toBe("919834500000");
    expect(sanitizePhoneForWhatsApp("p:+919834500000")).toBe("919834500000");
  });

  it("handles numbers starting with leading 0 (11 digits in India)", () => {
    expect(sanitizePhoneForWhatsApp("09834500000")).toBe("919834500000");
  });

  it("returns empty string for null, undefined, or empty values", () => {
    expect(sanitizePhoneForWhatsApp(null)).toBe("");
    expect(sanitizePhoneForWhatsApp(undefined)).toBe("");
    expect(sanitizePhoneForWhatsApp("")).toBe("");
    expect(sanitizePhoneForWhatsApp("   ")).toBe("");
  });
});

describe("sanitizePhoneForCopy", () => {
  it("strips Meta transport prefix 'p:'", () => {
    expect(sanitizePhoneForCopy("p:+919834500000")).toBe("+919834500000");
    expect(sanitizePhoneForCopy("P:9834500000")).toBe("9834500000");
  });

  it("trims whitespace", () => {
    expect(sanitizePhoneForCopy("  +919834500000  ")).toBe("+919834500000");
  });

  it("returns empty string for missing values", () => {
    expect(sanitizePhoneForCopy(null)).toBe("");
    expect(sanitizePhoneForCopy(undefined)).toBe("");
  });
});

describe("formatCampaignName", () => {
  it("cleans up snake_case slugs into capitalized title", () => {
    const res = formatCampaignName("siliguri_launch_campaign");
    expect(res.title).toBe("Siliguri Launch Campaign");
    expect(res.badges).toEqual([]);
  });

  it("extracts trailing month+year as a secondary badge", () => {
    const res = formatCampaignName("siliguri_launch_campaign_sep2026");
    expect(res.title).toBe("Siliguri Launch Campaign");
    expect(res.badges).toEqual(["Sep 2026"]);
  });

  it("extracts trailing BHK specification as a badge", () => {
    const res = formatCampaignName("rba_sector_5_launch_3bhk");
    expect(res.title).toBe("RBA Sector 5 Launch");
    expect(res.badges).toEqual(["3 BHK"]);
  });

  it("extracts multiple trailing tags (e.g. BHK and Date)", () => {
    const res = formatCampaignName("rba_residency_3bhk_sep2026");
    expect(res.title).toBe("RBA Residency");
    expect(res.badges).toEqual(["3 BHK", "Sep 2026"]);
  });

  it("extracts trailing sqft area size", () => {
    const res = formatCampaignName("siliguri_plots_1200sqft");
    expect(res.title).toBe("Siliguri Plots");
    expect(res.badges).toEqual(["1200 sqft"]);
  });

  it("preserves already well-formatted names like 'RBA - Sector 5 Launch'", () => {
    const res = formatCampaignName("RBA - Sector 5 Launch");
    expect(res.title).toBe("RBA - Sector 5 Launch");
    expect(res.badges).toEqual([]);
  });

  it("handles null or empty campaign names gracefully", () => {
    expect(formatCampaignName(null)).toEqual({ title: "—", badges: [] });
    expect(formatCampaignName("")).toEqual({ title: "—", badges: [] });
    expect(formatCampaignName("   ")).toEqual({ title: "—", badges: [] });
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds the correct WhatsApp Web URL with pre-filled greeting and sanitized phone", () => {
    const url = buildWhatsAppUrl("+919834500000", "Anjali Roy", "Siliguri Launch");
    expect(url).toBe(
      "https://web.whatsapp.com/send?phone=919834500000&text=Hi%20Anjali%20Roy%2C%20reaching%20out%20from%20RBA%20Realtors%20regarding%20your%20inquiry%20on%20Siliguri%20Launch."
    );
  });

  it("defaults full_name to 'there' when missing", () => {
    const url = buildWhatsAppUrl("9834500000", null, "Siliguri Launch");
    expect(url).toContain("Hi%20there");
  });

  it("defaults campaign_name to 'our property' when missing", () => {
    const url = buildWhatsAppUrl("9834500000", "Rahul", null);
    expect(url).toContain("on%20our%20property");
  });

  it("returns empty string if phone is missing", () => {
    expect(buildWhatsAppUrl(null, "Rahul", "Campaign")).toBe("");
    expect(buildWhatsAppUrl("", "Rahul", "Campaign")).toBe("");
  });
});
