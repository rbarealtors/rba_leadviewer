import { describe, it, expect } from "vitest";
import { parseMagicBricksEmail } from "../src/lib/leads/email-parser-magicbricks";

const SAMPLE_MAGICBRICKS_EMAIL = `
Dear Advertiser,

A buyer has expressed interested in your Property, ID 69284712: 4 BHK Flat in Pradhan Nagar Siliguri

Sender's Details:
Sender's Name: Rohit Singhania (Buyer)
Mobile: +91-9876543210
Email: rohit.singhania@gmail.com

Property Details:
Property ID: 69284712
Configuration: 4 BHK
Price: Rs 1.25 Cr

Regards,
Magicbricks Team
`;

describe("parseMagicBricksEmail", () => {
  it("extracts full name matching after Sender's Name: ignoring parentheses", () => {
    const res = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    expect(res.full_name).toBe("Rohit Singhania");
  });


  it("extracts property ID and description as campaign_name", () => {
    const res = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    expect(res.property_id).toBe("69284712");
    expect(res.campaign_name).toBe("4 BHK Flat in Pradhan Nagar Siliguri");
  });

  it("extracts bhk_configuration", () => {
    const res = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    expect(res.bhk_configuration).toBe("4 BHK");
  });

  it("extracts budget_range", () => {
    const res = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    expect(res.budget_range).toBe("Rs 1.25 Cr");
  });

  it("generates deterministic external_lead_id as MB-${propertyId}-${cleanPhone}", () => {
    const res1 = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    const res2 = parseMagicBricksEmail(SAMPLE_MAGICBRICKS_EMAIL);
    expect(res1.external_lead_id).toBe("MB-69284712-919876543210");
    expect(res1.external_lead_id).toBe(res2.external_lead_id);
  });

  it("extracts campaign_name from subject line after 'for - ' if body lacks explicit property title", () => {
    const textWithoutProperty = `
Sender's Details:
Sender's Name: Priya Agarwal
Mobile: 9832001122
Email: priya@yahoo.com
Property ID: 77889900
`;
    const subject = "Magicbricks: Lead alert for - 3 BHK Luxury Villa in Matigara";
    const res = parseMagicBricksEmail(textWithoutProperty, subject);
    expect(res.full_name).toBe("Priya Agarwal");
    expect(res.phone_number).toBe("+919832001122");
    expect(res.campaign_name).toBe("3 BHK Luxury Villa in Matigara");
    expect(res.bhk_configuration).toBe("3 BHK");
    expect(res.external_lead_id).toBe("MB-77889900-919832001122");
  });

  it("handles missing propertyId by falling back to 'prop' in external_lead_id", () => {
    const text = `
Sender's Name: Amit Paul
Mobile: 9811223344
`;
    const res = parseMagicBricksEmail(text);
    expect(res.full_name).toBe("Amit Paul");
    expect(res.phone_number).toBe("+919811223344");
    expect(res.external_lead_id).toBe("MB-prop-919811223344");
  });

  it("handles empty input gracefully", () => {
    const res = parseMagicBricksEmail("");
    expect(res.full_name).toBeNull();
    expect(res.phone_number).toBeNull();
    expect(res.campaign_name).toBeNull();
    expect(res.external_lead_id).toMatch(/^MB-prop-/);
  });
});

