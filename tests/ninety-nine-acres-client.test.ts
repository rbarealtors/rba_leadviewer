import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  format99AcresDate,
  validateDateRange,
  buildQueryXml,
  redactPhone,
  redactEmail,
  redactName,
  redactEnquiry,
  parse99AcresXmlResponse,
  getRedactedEndpointUrl,
  executeNinetyNineAcresDiagnostic,
} from "../src/lib/leads/ninety-nine-acres-client";

describe("99acres Client & Diagnostic Module", () => {
  describe("format99AcresDate", () => {
    it("formats date to YYYY-MM-DD HH:mm:ss", () => {
      const d = new Date(2026, 3, 17, 14, 30, 45); // Month is 0-indexed (3 = April)
      expect(format99AcresDate(d)).toBe("2026-04-17 14:30:45");
    });
  });

  describe("validateDateRange", () => {
    const fixedNow = new Date("2026-04-17T12:00:00Z");

    it("accepts valid date range under 48 hours within 30 days", () => {
      const start = new Date("2026-04-16T12:00:00Z");
      const end = new Date("2026-04-17T12:00:00Z");
      const res = validateDateRange(start, end, fixedNow);
      expect(res.valid).toBe(true);
    });

    it("rejects date range exceeding 48 hours", () => {
      const start = new Date("2026-04-14T11:00:00Z");
      const end = new Date("2026-04-17T12:00:00Z"); // 73 hours
      const res = validateDateRange(start, end, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("exceeds the 2-day maximum limit");
    });

    it("rejects start date older than 30 days", () => {
      const start = new Date("2026-03-10T12:00:00Z"); // 38 days ago
      const end = new Date("2026-03-11T12:00:00Z");
      const res = validateDateRange(start, end, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("older than 30 days");
    });

    it("rejects end date earlier than start date", () => {
      const start = new Date("2026-04-17T12:00:00Z");
      const end = new Date("2026-04-16T12:00:00Z");
      const res = validateDateRange(start, end, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("end_date must be greater than or equal to start_date");
    });
  });

  describe("buildQueryXml", () => {
    it("builds query XML with <pswd> by default", () => {
      const xml = buildQueryXml("rba_user", "secr<e>t", "2026-04-16 00:00:00", "2026-04-17 00:00:00");
      expect(xml).toContain("<user_name>rba_user</user_name>");
      expect(xml).toContain("<pswd>secr&lt;e&gt;t</pswd>");
      expect(xml).toContain("<start_date>2026-04-16 00:00:00</start_date>");
      expect(xml).toContain("<end_date>2026-04-17 00:00:00</end_date>");
    });

    it("builds query XML with <pwd> when specified", () => {
      const xml = buildQueryXml("rba_user", "secret", "2026-04-16 00:00:00", "2026-04-17 00:00:00", "pwd");
      expect(xml).toContain("<pwd>secret</pwd>");
      expect(xml).not.toContain("<pswd>");
    });
  });

  describe("PII Redaction", () => {
    it("redacts phone numbers while preserving last 2 digits for reference", () => {
      expect(redactPhone("+919876543210")).toBe("+91-XXXXX-XX10");
      expect(redactPhone("9876543210")).toBe("+91-XXXXX-XX10");
      expect(redactPhone(null)).toBeNull();
    });

    it("redacts email addresses masking username", () => {
      expect(redactEmail("rajesh.kumar@gmail.com")).toBe("r***r@gmail.com");
      expect(redactEmail(null)).toBeNull();
    });

    it("redacts names masking all but initial letters", () => {
      expect(redactName("Rajesh Kumar")).toBe("R*** K***");
      expect(redactName(null)).toBeNull();
    });

    it("redacts entire enquiry structure safely", () => {
      const raw = {
        tblId: "Q-991234",
        resType: "S2M",
        prodId: "W79666903",
        compactLabel: "Flat in Anandville",
        queryInfo: "Need urgent site visit for 3 BHK flat in Darjeeling More next Sunday",
        receivedOn: "2026-04-16 11:20:00",
        name: "Rajesh Kumar",
        email: "rajesh@example.com",
        phone: "9876543210",
      };

      const redacted = redactEnquiry(raw);
      expect(redacted.tblId).toBe("Q-991234");
      expect(redacted.prodId).toBe("W79666903");
      expect(redacted.maskedName).toBe("R*** K***");
      expect(redacted.maskedPhone).toBe("+91-XXXXX-XX10");
      expect(redacted.maskedEmail).toBe("r***h@example.com");
      expect(redacted.querySnippet).toContain("... [68 chars]");
    });
  });

  describe("parse99AcresXmlResponse", () => {
    it("parses valid response with multiple enquiries", () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Xml ActionStatus="true">
  <Resp>
    <QryDtl TblId="Q-1001" ResType="S2M">
      <ProdId Status="Active">W79666903</ProdId>
      <CmpctLabl>Flat in Anandville</CmpctLabl>
      <QryInfo>Interested in 3 BHK</QryInfo>
      <RcvdOn>2026-04-16 10:15:00</RcvdOn>
    </QryDtl>
    <CntctDtl>
      <Name>Aman Sharma</Name>
      <Email>aman@gmail.com</Email>
      <Phone>9876543210</Phone>
    </CntctDtl>
  </Resp>
  <Resp>
    <QryDtl TblId="Q-1002" ResType="S2M">
      <ProdId Status="Active">V85103180</ProdId>
      <CmpctLabl>Villa in Uttorayon</CmpctLabl>
      <QryInfo>What is the price?</QryInfo>
      <RcvdOn>2026-04-16 11:20:00</RcvdOn>
    </QryDtl>
    <CntctDtl>
      <Name>Pooja Roy</Name>
      <Email>pooja@gmail.com</Email>
      <Phone>9123456789</Phone>
    </CntctDtl>
  </Resp>
</Xml>`;

      const res = parse99AcresXmlResponse(sampleXml);
      expect(res.actionStatus).toBe(true);
      expect(res.errorCode).toBeNull();
      expect(res.enquiries.length).toBe(2);

      expect(res.enquiries[0]?.tblId).toBe("Q-1001");
      expect(res.enquiries[0]?.prodId).toBe("W79666903");
      expect(res.enquiries[0]?.compactLabel).toBe("Flat in Anandville");
      expect(res.enquiries[0]?.name).toBe("Aman Sharma");
      expect(res.enquiries[0]?.phone).toBe("9876543210");

      expect(res.enquiries[1]?.tblId).toBe("Q-1002");
      expect(res.enquiries[1]?.prodId).toBe("V85103180");
    });

    it("parses empty response (zero enquiries) without error", () => {
      const emptyXml = `<Xml ActionStatus="true"></Xml>`;
      const res = parse99AcresXmlResponse(emptyXml);
      expect(res.actionStatus).toBe(true);
      expect(res.errorCode).toBeNull();
      expect(res.enquiries.length).toBe(0);
    });

    it("parses vendor authentication failure ERROR-0001", () => {
      const errorXml = `<Xml ActionStatus="false" ErrorCode="ERROR-0001"><ErrorMsg>Invalid Username or Password</ErrorMsg></Xml>`;
      const res = parse99AcresXmlResponse(errorXml);
      expect(res.actionStatus).toBe(false);
      expect(res.errorCode).toBe("ERROR-0001");
      expect(res.errorMessage).toBe("Invalid Username or Password");
      expect(res.enquiries.length).toBe(0);
    });

    it("parses vendor date range error ERROR-0003", () => {
      const errorXml = `<Xml ActionStatus="false" ErrorCode="ERROR-0003"><ErrorMsg>Date range should not exceed 2 days</ErrorMsg></Xml>`;
      const res = parse99AcresXmlResponse(errorXml);
      expect(res.actionStatus).toBe(false);
      expect(res.errorCode).toBe("ERROR-0003");
    });
  });

  describe("getRedactedEndpointUrl", () => {
    it("redacts token in endpoint URL", () => {
      const url = getRedactedEndpointUrl("https://www.99acres.com/99api/v1/getmy99Response", "secretToken12345");
      expect(url).toBe("https://www.99acres.com/99api/v1/getmy99Response/sec***345/uid/");
      expect(url).not.toContain("secretToken12345");
    });
  });

  describe("executeNinetyNineAcresDiagnostic", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns error if credentials are missing", async () => {
      const res = await executeNinetyNineAcresDiagnostic({
        token: "",
        username: "",
        password: "",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Missing credentials");
    });

    it("succeeds and redacts data on valid mock response", async () => {
      const mockXml = `<Xml ActionStatus="true">
        <Resp>
          <QryDtl TblId="Q-8888">
            <ProdId>W79666903</ProdId>
            <CmpctLabl>Flat in Anandville</CmpctLabl>
            <QryInfo>Interested</QryInfo>
            <RcvdOn>2026-04-16 12:00:00</RcvdOn>
          </QryDtl>
          <CntctDtl>
            <Name>Rajesh Kumar</Name>
            <Email>rajesh@test.com</Email>
            <Phone>9876543210</Phone>
          </CntctDtl>
        </Resp>
      </Xml>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockXml,
      } as any);

      const now = new Date();
      const res = await executeNinetyNineAcresDiagnostic(
        {
          token: "validToken123",
          username: "rba_test",
          password: "test_password",
        },
        {
          startDate: new Date(now.getTime() - 24 * 3600 * 1000),
          endDate: now,
        }
      );

      expect(res.success).toBe(true);
      expect(res.totalEnquiries).toBe(1);
      expect(res.enquiriesRedacted[0]?.tblId).toBe("Q-8888");
      expect(res.enquiriesRedacted[0]?.prodId).toBe("W79666903");
      expect(res.enquiriesRedacted[0]?.maskedName).toBe("R*** K***");
      expect(res.enquiriesRedacted[0]?.maskedPhone).toBe("+91-XXXXX-XX10");
      expect(res.endpointUrlRedacted).not.toContain("validToken123");
    });

    it("detects vendor authentication failure", async () => {
      const mockXml = `<Xml ActionStatus="false" ErrorCode="ERROR-0001"><ErrorMsg>Invalid credentials</ErrorMsg></Xml>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockXml,
      } as any);

      const now = new Date();
      const res = await executeNinetyNineAcresDiagnostic(
        {
          token: "invalidToken",
          username: "wrong_user",
          password: "wrong_password",
        },
        {
          startDate: new Date(now.getTime() - 24 * 3600 * 1000),
          endDate: now,
        }
      );

      expect(res.success).toBe(false);
      expect(res.vendorErrorCode).toBe("ERROR-0001");
      expect(res.error).toContain("Authentication failure");
    });

    it("handles zero enquiries as a successful connection", async () => {
      const mockXml = `<Xml ActionStatus="true"></Xml>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockXml,
      } as any);

      const now = new Date();
      const res = await executeNinetyNineAcresDiagnostic(
        {
          token: "validToken123",
          username: "rba_test",
          password: "test_password",
        },
        {
          startDate: new Date(now.getTime() - 24 * 3600 * 1000),
          endDate: now,
        }
      );

      expect(res.success).toBe(true);
      expect(res.totalEnquiries).toBe(0);
    });
  });
});
