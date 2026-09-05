import { describe, it, expect } from "vitest";
import {
  normalizeGoogleLead,
  GoogleWebhookValidationError,
  type GoogleWebhookPayload,
} from "../src/lib/leads/normalize-google";

function basePayload(overrides: Partial<GoogleWebhookPayload> = {}): GoogleWebhookPayload {
  return {
    lead_id: "123456789",
    api_version: "1",
    form_id: 555,
    campaign_id: 111,
    adgroup_id: 222,
    google_key: "secret",
    gcl_id: "abc.123",
    lead_submit_time: "2026-09-01T10:00:00Z",
    user_column_data: [
      { column_id: "FULL_NAME", string_value: "Priya Sharma" },
      { column_id: "EMAIL", string_value: "priya@example.com" },
      { column_id: "PHONE_NUMBER", string_value: "+919876543210" },
      { column_id: "PRICE_RANGE", string_value: "50L-75L" },
      { column_id: "NUMBER_OF_BEDROOMS", string_value: "3 BHK" },
      { column_id: "PURCHASE_TIMELINE", string_value: "1-3 months" },
    ],
    ...overrides,
  };
}

describe("normalizeGoogleLead", async () => {
  it("maps a full real-estate lead into the common shape", async () => {
    const lead = await normalizeGoogleLead(basePayload());

    expect(lead.source).toBe("google_ads");
    expect(lead.external_lead_id).toBe("123456789");
    expect(lead.full_name).toBe("Priya Sharma");
    expect(lead.email).toBe("priya@example.com");
    expect(lead.phone_number).toBe("+919876543210");
    expect(lead.budget_range).toBe("50L-75L");
    expect(lead.bhk_configuration).toBe("3 BHK");
    expect(lead.planning_timeline).toBe("1-3 months");
    expect(lead.source_submitted_at).toBe("2026-09-01T10:00:00.000Z");
    expect(lead.raw_payload).toBeTruthy();
  });

  it("falls back to FIRST_NAME + LAST_NAME when FULL_NAME is absent", async () => {
    const payload = basePayload({
      user_column_data: [
        { column_id: "FIRST_NAME", string_value: "Priya" },
        { column_id: "LAST_NAME", string_value: "Sharma" },
      ],
    });
    const lead = await normalizeGoogleLead(payload);
    expect(lead.full_name).toBe("Priya Sharma");
  });

  it("leaves optional fields null when not present, never invents values", async () => {
    const payload = basePayload({ user_column_data: [{ column_id: "FULL_NAME", string_value: "Only Name" }] });
    const lead = await normalizeGoogleLead(payload);
    expect(lead.email).toBeNull();
    expect(lead.phone_number).toBeNull();
    expect(lead.budget_range).toBeNull();
    expect(lead.bhk_configuration).toBeNull();
    expect(lead.planning_timeline).toBeNull();
  });

  it("throws GoogleWebhookValidationError when lead_id is missing", async () => {
    const payload = basePayload();
    delete payload.lead_id;
    await expect(normalizeGoogleLead(payload)).rejects.toThrow(GoogleWebhookValidationError);
  });

  it("ignores unrecognized fields for forward compatibility", async () => {
    const payload = { ...basePayload(), some_future_field: { nested: true } };
    await expect(normalizeGoogleLead(payload)).resolves.not.toThrow();
  });
});
