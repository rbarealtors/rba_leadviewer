import { describe, it, expect } from "vitest";
import { matchesSearch } from "../src/lib/leads/search";
import type { Lead } from "../src/lib/leads/types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    source: "google_ads",
    external_lead_id: "1",
    full_name: "Anjali Roy",
    phone_number: "+919834500000",
    email: "anjali.roy@gmail.com",
    campaign_name: "Siliguri Launch Campaign",
    ad_group_name: "3 BHK Buyers",
    ad_name: "Video Ad",
    budget_range: "60L-80L",
    bhk_configuration: "3 BHK",
    planning_timeline: "Within 3 months",
    platform: null,
    source_submitted_at: "2026-09-01T06:00:00.000Z",
    created_at: "2026-09-01T06:00:01.000Z",
    viewed_at: null,
    raw_payload: {},
    ...overrides,
  };
}

describe("matchesSearch", () => {
  it("matches on partial, case-insensitive BHK value", () => {
    expect(matchesSearch(makeLead(), "3 bhk")).toBe(true);
  });

  it("matches on partial campaign name substring ('Silig')", () => {
    expect(matchesSearch(makeLead(), "Silig")).toBe(true);
  });

  it("matches on partial phone number ('9834')", () => {
    expect(matchesSearch(makeLead(), "9834")).toBe(true);
  });

  it("matches on email domain ('gmail')", () => {
    expect(matchesSearch(makeLead(), "gmail")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearch(makeLead(), "nonexistent-term-xyz")).toBe(false);
  });

  it("returns true for an empty/blank search term (no filtering applied)", () => {
    expect(matchesSearch(makeLead(), "")).toBe(true);
    expect(matchesSearch(makeLead(), "   ")).toBe(true);
  });

  it("does not blow up on leads with missing (null) optional fields", () => {
    const lead = makeLead({ email: null, budget_range: null, bhk_configuration: null, planning_timeline: null });
    expect(matchesSearch(lead, "Anjali")).toBe(true);
    expect(matchesSearch(lead, "bhk")).toBe(false);
  });
});
