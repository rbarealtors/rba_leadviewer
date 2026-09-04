import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../src/app/api/webhooks/portal-email/route";

// Mock Supabase admin client
const mockInsert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: mockInsert,
    }),
  }),
}));

const SAMPLE_BODY = `
Details of the response
Aman Sharma
+91-8054549678
aman@example.com

Property Details:
Property ID: W79666903
Flat in Anandville Darjeeling More
Configuration: 3 BHK
Price: Rs67.12 Lac
`;

describe("POST /api/webhooks/portal-email", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, PORTAL_WEBHOOK_SECRET: "test-secret" };
  });

  it("returns 401 Unauthorized if secret does not match", async () => {
    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "wrong-secret", body: SAMPLE_BODY }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 if body is missing or empty", async () => {
    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "test-secret", body: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("successfully parses 99acres lead and inserts into Supabase with source: '99acres'", async () => {
    mockInsert.mockResolvedValueOnce({ error: null });

    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "test-secret",
        from: "leads@99acres.com",
        subject: "Query for your Property Id W79666903 - Flat in Anandville Darjeeling More",
        body: SAMPLE_BODY,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.lead_id).toBe("W79666903-918054549678");
    expect(json.lead.full_name).toBe("Aman Sharma");
    expect(json.lead.phone_number).toBe("+918054549678");
    expect(json.lead.bhk_configuration).toBe("3 BHK");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "99acres",
        external_lead_id: "W79666903-918054549678",
        full_name: "Aman Sharma",
        phone_number: "+918054549678",
        campaign_name: "Flat in Anandville Darjeeling More",
        bhk_configuration: "3 BHK",
        budget_range: "Rs67.12 Lac",
      })
    );
  });

  it("handles duplicate lead delivery idempotently (Postgres error 23505)", async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key value" } });

    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "test-secret",
        body: SAMPLE_BODY,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.duplicate).toBe(true);
  });

  it("authenticates with SHEETS_WEBHOOK_SECRET if PORTAL_WEBHOOK_SECRET is not set", async () => {
    delete process.env.PORTAL_WEBHOOK_SECRET;
    process.env.SHEETS_WEBHOOK_SECRET = "fallback-sheets-secret";
    mockInsert.mockResolvedValueOnce({ error: null });

    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "fallback-sheets-secret",
        body: SAMPLE_BODY,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("detects MagicBricks emails (via from or body) and stores with source: 'magicbricks'", async () => {
    mockInsert.mockResolvedValueOnce({ error: null });

    const mbBody = `
Dear Advertiser,

A buyer has expressed interested in your Property, ID 69284712: 4 BHK Flat in Pradhan Nagar

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

    const req = new Request("http://localhost/api/webhooks/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "test-secret",
        from: "leads@magicbricks.com",
        subject: "Magicbricks: Lead alert for - 4 BHK Flat in Pradhan Nagar",
        body: mbBody,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.source).toBe("magicbricks");
    expect(json.lead_id).toBe("MB-69284712-919876543210");
    expect(json.lead.full_name).toBe("Rohit Singhania");
    expect(json.lead.phone_number).toBe("+919876543210");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "magicbricks",
        external_lead_id: "MB-69284712-919876543210",
        full_name: "Rohit Singhania",
        phone_number: "+919876543210",
        campaign_name: "4 BHK Flat in Pradhan Nagar",
        bhk_configuration: "4 BHK",
        budget_range: "Rs 1.25 Cr",
      })
    );
  });
});

