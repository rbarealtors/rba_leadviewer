import { describe, it, expect } from "vitest";
import {
  normalizeMetaLead,
  extractLeadgenNotifications,
  MetaLeadValidationError,
  type MetaLeadDetail,
  type MetaWebhookEnvelope,
} from "../src/lib/leads/normalize-meta";

describe("extractLeadgenNotifications", () => {
  it("pulls leadgen change values out of a webhook envelope", () => {
    const envelope: MetaWebhookEnvelope = {
      object: "page",
      entry: [
        {
          id: "page123",
          time: 123,
          changes: [
            { field: "leadgen", value: { leadgen_id: "L1", page_id: "page123", form_id: "F1" } },
            { field: "some_other_field", value: { leadgen_id: "SHOULD_NOT_APPEAR" } },
          ],
        },
      ],
    };

    const result = extractLeadgenNotifications(envelope);
    expect(result).toHaveLength(1);
    expect(result[0]?.leadgen_id).toBe("L1");
  });

  it("returns an empty array when there are no leadgen changes", () => {
    expect(extractLeadgenNotifications({ entry: [] })).toEqual([]);
    expect(extractLeadgenNotifications({})).toEqual([]);
  });
});

describe("normalizeMetaLead", () => {
  function baseDetail(overrides: Partial<MetaLeadDetail> = {}): MetaLeadDetail {
    return {
      id: "987654321",
      created_time: "2026-09-01T05:00:00+0000",
      campaign_name: "RBA - Sector 5 Launch",
      adset_name: "3BHK Interest",
      ad_name: "Carousel Ad 1",
      platform: "ig",
      field_data: [
        { name: "full_name", values: ["Rahul Verma"] },
        { name: "phone_number", values: ["p:9876500000"] },
      ],
      ...overrides,
    };
  }

  it("maps a Meta lead (name + phone only) into the common shape", () => {
    const lead = normalizeMetaLead(baseDetail());

    expect(lead.source).toBe("meta_ads");
    expect(lead.external_lead_id).toBe("987654321");
    expect(lead.full_name).toBe("Rahul Verma");
    expect(lead.phone_number).toBe("9876500000"); // p: prefix stripped
    expect(lead.email).toBeNull();
    expect(lead.budget_range).toBeNull();
    expect(lead.bhk_configuration).toBeNull();
    expect(lead.planning_timeline).toBeNull();
    expect(lead.campaign_name).toBe("RBA - Sector 5 Launch");
    // Meta's "ad set" is intentionally surfaced under the unified "Ad Group" column.
    expect(lead.ad_group_name).toBe("3BHK Interest");
    expect(lead.platform).toBe("instagram");
  });

  it("maps platform 'fb' to 'facebook'", () => {
    const lead = normalizeMetaLead(baseDetail({ platform: "fb" }));
    expect(lead.platform).toBe("facebook");
  });

  it("maps unknown platform values to null rather than inventing one", () => {
    const lead = normalizeMetaLead(baseDetail({ platform: "unknown_surface" }));
    expect(lead.platform).toBeNull();
  });

  it("throws MetaLeadValidationError when id is missing", () => {
    const detail = baseDetail();
    // @ts-expect-error testing malformed input
    delete detail.id;
    expect(() => normalizeMetaLead(detail)).toThrow(MetaLeadValidationError);
  });
});
