import { describe, it, expect } from "vitest";
import { parse99AcresEmail } from "../src/lib/leads/email-parser-99acres";

const SAMPLE_99ACRES_EMAIL = `
Dear Advertiser,

Someone has expressed interest in your property on 99acres.com.

Details of the response
Aman Sharma
+91-8054549678
aman.sharma@gmail.com

Property Details:
Property ID: W79666903
Flat in Anandville Darjeeling More
Configuration: 3 BHK
Price: Rs67.12 Lac

Regards,
99acres Team
`;

const QUERY_NAME_99ACRES_EMAIL = `
Details of the Query
Dinesh

+91-9051516266 *(Verified)*
`;

describe("parse99AcresEmail", () => {
  it("extracts full name from line directly below 'Details of the response'", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.full_name).toBe("Aman Sharma");
  });

  it("extracts the caller name below 'Details of the Query'", () => {
    const res = parse99AcresEmail(QUERY_NAME_99ACRES_EMAIL);
    expect(res.full_name).toBe("Dinesh");
    expect(res.phone_number).toBe("+919051516266");
  });

  it("extracts phone number and normalizes to E.164 (+918054549678)", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.phone_number).toBe("+918054549678");
  });

  it("extracts contact email address", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.email).toBe("aman.sharma@gmail.com");
  });

  it("extracts campaign_name (property title)", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.campaign_name).toBe("Flat in Anandville Darjeeling More");
  });

  it("extracts bhk_configuration", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.bhk_configuration).toBe("3 BHK");
  });

  it("extracts budget_range", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.budget_range).toBe("Rs67.12 Lac");
  });

  it("extracts property_id", () => {
    const res = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res.property_id).toBe("W79666903");
  });

  it("generates deterministic external_lead_id as ${propertyId}-${cleanPhone}", () => {
    const res1 = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    const res2 = parse99AcresEmail(SAMPLE_99ACRES_EMAIL);
    expect(res1.external_lead_id).toBe("W79666903-918054549678");
    expect(res1.external_lead_id).toBe(res2.external_lead_id);
  });

  it("extracts property title from subject line when missing in body", () => {
    const textWithoutProperty = `
Details of the response
Rahul Verma
+91 9876543210
Property ID: W12345678
3 BHK
Rs 85 Lac
`;
    const subject = "Query for your Property Id W12345678 - Flat in Anandville Darjeeling More";
    const res = parse99AcresEmail(textWithoutProperty, subject);
    expect(res.full_name).toBe("Rahul Verma");
    expect(res.phone_number).toBe("+919876543210");
    expect(res.property_id).toBe("W12345678");
    expect(res.campaign_name).toBe("Flat in Anandville Darjeeling More");
    expect(res.external_lead_id).toBe("W12345678-919876543210");
  });

  it("handles 10-digit Indian phone without prefix", () => {
    const text = `
Details of the response
Pooja Sen
8054549678
Property ID: W99887766
`;
    const res = parse99AcresEmail(text);
    expect(res.full_name).toBe("Pooja Sen");
    expect(res.phone_number).toBe("+918054549678");
    expect(res.external_lead_id).toBe("W99887766-918054549678");
  });

  it("handles fallback external_lead_id when propertyId is missing", () => {
    const text = `
Details of the response
Pooja Sen
9876543210
`;
    const res = parse99AcresEmail(text);
    expect(res.external_lead_id).toContain("99acres-919876543210");
  });

  it("handles empty or missing input gracefully", () => {
    const res = parse99AcresEmail("");
    expect(res.full_name).toBeNull();
    expect(res.phone_number).toBeNull();
    expect(res.campaign_name).toBeNull();
    expect(res.external_lead_id).toBeTruthy();
  });

  it("extracts clean property title from subject line without slicing noisy body text", () => {
    const body = `
Property Advertisement Response 
Dear Rakesh Garg 
This buyer is looking for 2 BHK Flat in Champasari for Rs44 Lac on 
99acres.com 
Details of the response 
Ayush Banik 

+91-9330546785 *(Verified)* 
`;
    const subject = "Advertisement Response for Rs44 Lac, 2 BHK Flat in NS Alti Level Champasari";
    const res = parse99AcresEmail(body, subject);

    expect(res.full_name).toBe("Ayush Banik");
    expect(res.phone_number).toBe("+919330546785");
    expect(res.property_id).toBeNull();
    // Must extract "NS Alti Level Champasari" from subject, NOT "Flat in Champasari for Rs44 Lac on" from body
    expect(res.campaign_name).toBe("NS Alti Level Champasari");
    expect(res.bhk_configuration).toBe("2 BHK");
  });

  it("extracts clean property title from 'Buyer wants to know' subject line", () => {
    const body = `
Property Advertisement Query
Dear Rakesh Garg
Details of the Query
Kamal Roy
+91-6294852484
`;
    const subject = "Buyer wants to know about your Rs57.71 Lac, 3 BHK Flat in Ashiyana Heights Matigara";
    const res = parse99AcresEmail(body, subject);

    expect(res.campaign_name).toBe("Ashiyana Heights Matigara");
    expect(res.bhk_configuration).toBe("3 BHK");
  });

  it("extracts clean property title from dashed subject line", () => {
    const body = `
Property Advertisement Response
Details of the response
Dinesh
+91-9093059992
`;
    const subject = "Property Advertisement Response - Green Retreat";
    const res = parse99AcresEmail(body, subject);

    expect(res.campaign_name).toBe("Green Retreat");
  });
});

