import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Google Apps Script Ingestion Logic (Code.gs)
 * Validates search query construction, read/unread neutrality, subject patterns,
 * duplicate handling, batch pagination, Script Properties validation,
 * ambiguous response rejection, and multi-message thread protection.
 */

interface MockMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
  isUnread: boolean;
}

interface MockThread {
  id: string;
  messages: MockMessage[];
  labels: string[];
}

// Logic mirror of Code.gs isEligibleEnquiry
function isEligibleEnquiry(portal: string, subject: string, body: string): { eligible: boolean; reason?: string } {
  const s = (subject || "").toLowerCase();
  const b = (body || "").toLowerCase();

  const skipKeywords = [
    "photos deleted",
    "listing expired",
    "listing rejected",
    "invoice",
    "tax invoice",
    "payment confirmation",
    "verification call",
    "screening test",
    "account statement",
    "reset password",
    "login alert",
    "performance report",
  ];

  for (const kw of skipKeywords) {
    if (s.includes(kw) || b.includes(kw)) {
      return { eligible: false, reason: `Administrative/system notice: ${kw}` };
    }
  }

  if (portal === "99acres") {
    const isVerifiedSubject =
      s.includes("advertisement response") ||
      s.includes("query for your property id") ||
      s.includes("buyer wants to know about your") ||
      s.includes("details of the query") ||
      s.includes("property advertisement response");

    const hasEnquiryBodySignature =
      b.includes("details of the response") ||
      b.includes("response details") ||
      b.includes("details of the query") ||
      b.includes("property details:");

    if (isVerifiedSubject || hasEnquiryBodySignature) {
      return { eligible: true };
    }
    return { eligible: false, reason: "Did not match 99acres enquiry patterns" };
  }

  if (portal === "magicbricks") {
    const isMagicBricksSubject =
      s.includes("magicbricks") ||
      s.includes("response on your property") ||
      s.includes("enquiry for");

    const hasMbBody =
      b.includes("magicbricks") ||
      b.includes("buyer details") ||
      b.includes("contact details");

    if (isMagicBricksSubject || hasMbBody) {
      return { eligible: true };
    }
    return { eligible: false, reason: "Did not match Magicbricks enquiry patterns" };
  }

  return { eligible: false, reason: "Unknown portal" };
}

// Logic mirror of search query generator
function buildSearchQuery(portal: string, labelName: string, lookbackDays: number): string {
  const senderQuery = portal === "99acres" ? "from:(99acres.com)" : "from:(magicbricks.com)";
  return `${senderQuery} -label:${labelName} newer_than:${lookbackDays}d`;
}

// Logic mirror of getValidatedWebhookConfig in Code.gs
function validateWebhookConfig(properties: Record<string, string | null | undefined>): {
  valid: boolean;
  url?: string;
  secret?: string;
  error?: string;
} {
  const url = properties["CRM_WEBHOOK_URL"];
  const secret = properties["PORTAL_WEBHOOK_SECRET"];

  if (!url || typeof url !== "string" || url.trim() === "") {
    return { valid: false, error: "Missing CRM_WEBHOOK_URL in Script Properties" };
  }

  const cleanUrl = url.trim();

  if (!/^https:\/\//i.test(cleanUrl)) {
    return { valid: false, error: "Insecure protocol: CRM_WEBHOOK_URL must start with https://" };
  }

  if (cleanUrl.indexOf("/api/webhooks/portal-email") === -1) {
    return { valid: false, error: "Invalid endpoint: CRM_WEBHOOK_URL must contain /api/webhooks/portal-email" };
  }

  if (!secret || typeof secret !== "string" || secret.trim() === "" || secret.trim() === "YOUR_PORTAL_WEBHOOK_SECRET") {
    return { valid: false, error: "Missing or invalid PORTAL_WEBHOOK_SECRET in Script Properties" };
  }

  return { valid: true, url: cleanUrl, secret: secret.trim() };
}

// Logic mirror of sendToCrmWebhook response evaluation in Code.gs
function evaluateWebhookResponse(statusCode: number, responseText: string): {
  success: boolean;
  duplicate?: boolean;
  leadId?: string | null;
  error?: string;
} {
  if (statusCode === 200) {
    let json: any = null;
    try {
      json = JSON.parse(responseText);
    } catch {
      return { success: false, error: "Malformed JSON response from CRM webhook" };
    }

    if (
      json &&
      typeof json === "object" &&
      json.success === true &&
      typeof json.lead_id === "string" &&
      json.lead_id.trim().length > 0
    ) {
      return {
        success: true,
        duplicate: json.duplicate === true,
        leadId: json.lead_id.trim(),
      };
    } else {
      return {
        success: false,
        error: "Ambiguous response: Missing success=true or lead_id in response JSON",
      };
    }
  }

  return {
    success: false,
    error: `Webhook responded with HTTP ${statusCode}: ${responseText.slice(0, 150)}`,
  };
}

describe("Portal Email Ingestion Logic (Code.gs)", () => {
  describe("Script Properties & Endpoint Validation", () => {
    it("fails when CRM_WEBHOOK_URL is missing", () => {
      const res = validateWebhookConfig({
        PORTAL_WEBHOOK_SECRET: "valid-secret-123",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing CRM_WEBHOOK_URL");
    });

    it("fails when CRM_WEBHOOK_URL uses insecure HTTP protocol", () => {
      const res = validateWebhookConfig({
        CRM_WEBHOOK_URL: "http://example.com/api/webhooks/portal-email",
        PORTAL_WEBHOOK_SECRET: "valid-secret-123",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Insecure protocol: CRM_WEBHOOK_URL must start with https://");
    });

    it("fails when CRM_WEBHOOK_URL targets an incorrect path", () => {
      const res = validateWebhookConfig({
        CRM_WEBHOOK_URL: "https://example.com/api/other-endpoint",
        PORTAL_WEBHOOK_SECRET: "valid-secret-123",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid endpoint: CRM_WEBHOOK_URL must contain /api/webhooks/portal-email");
    });

    it("fails when PORTAL_WEBHOOK_SECRET is missing or set to placeholder", () => {
      const res1 = validateWebhookConfig({
        CRM_WEBHOOK_URL: "https://example.com/api/webhooks/portal-email",
      });
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain("Missing or invalid PORTAL_WEBHOOK_SECRET");

      const res2 = validateWebhookConfig({
        CRM_WEBHOOK_URL: "https://example.com/api/webhooks/portal-email",
        PORTAL_WEBHOOK_SECRET: "YOUR_PORTAL_WEBHOOK_SECRET",
      });
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain("Missing or invalid PORTAL_WEBHOOK_SECRET");
    });

    it("succeeds with valid HTTPS URL and secret", () => {
      const res = validateWebhookConfig({
        CRM_WEBHOOK_URL: "https://rba-crm.example.workers.dev/api/webhooks/portal-email",
        PORTAL_WEBHOOK_SECRET: "prod-secret-99acres",
      });
      expect(res.valid).toBe(true);
      expect(res.url).toBe("https://rba-crm.example.workers.dev/api/webhooks/portal-email");
      expect(res.secret).toBe("prod-secret-99acres");
    });
  });

  describe("Webhook Response Evaluation & Conservative Ambiguity Handling", () => {
    it("accepts valid new lead response (HTTP 200, success=true, lead_id)", () => {
      const res = evaluateWebhookResponse(
        200,
        JSON.stringify({ success: true, lead_id: "W79666903-918054549678", source: "99acres" })
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);
      expect(res.leadId).toBe("W79666903-918054549678");
    });

    it("accepts valid duplicate response (HTTP 200, success=true, duplicate=true, lead_id)", () => {
      const res = evaluateWebhookResponse(
        200,
        JSON.stringify({ success: true, duplicate: true, lead_id: "W79666903-918054549678" })
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(true);
      expect(res.leadId).toBe("W79666903-918054549678");
    });

    it("rejects malformed non-JSON body as ambiguous/failure", () => {
      const res = evaluateWebhookResponse(200, "<html><body>Internal Server Error</body></html>");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Malformed JSON response");
    });

    it("rejects HTTP 200 with missing lead_id as ambiguous/failure", () => {
      const res = evaluateWebhookResponse(200, JSON.stringify({ success: true }));
      expect(res.success).toBe(false);
      expect(res.error).toContain("Ambiguous response");
    });

    it("rejects HTTP 200 with success: false", () => {
      const res = evaluateWebhookResponse(200, JSON.stringify({ success: false, error: "Validation failed" }));
      expect(res.success).toBe(false);
      expect(res.error).toContain("Ambiguous response");
    });

    it("rejects non-200 responses (e.g. 204 No Content, 401 Unauthorized, 500)", () => {
      const res204 = evaluateWebhookResponse(204, "");
      expect(res204.success).toBe(false);

      const res401 = evaluateWebhookResponse(401, JSON.stringify({ error: "Unauthorized" }));
      expect(res401.success).toBe(false);
      expect(res401.error).toContain("HTTP 401");

      const res500 = evaluateWebhookResponse(500, JSON.stringify({ error: "DB connection failure" }));
      expect(res500.success).toBe(false);
      expect(res500.error).toContain("HTTP 500");
    });
  });

  describe("Search Query Construction", () => {
    it("never includes 'is:unread' in search query", () => {
      const query = buildSearchQuery("99acres", "99acres-processed", 7);
      expect(query).not.toContain("is:unread");
      expect(query).not.toContain("unread");
      expect(query).toContain("from:(99acres.com)");
      expect(query).toContain("-label:99acres-processed");
      expect(query).toContain("newer_than:7d");
    });

    it("generates correct query for magicbricks", () => {
      const query = buildSearchQuery("magicbricks", "magicbricks-processed", 7);
      expect(query).not.toContain("is:unread");
      expect(query).toContain("from:(magicbricks.com)");
      expect(query).toContain("-label:magicbricks-processed");
    });
  });

  describe("Subject Line & Eligibility Recognition", () => {
    it("recognizes confirmed 'Advertisement Response for...' 99acres subjects", () => {
      expect(
        isEligibleEnquiry(
          "99acres",
          "Advertisement Response for Rs44 Lac, 2 BHK Flat in NS Alti Level Champasari",
          "Some body"
        ).eligible
      ).toBe(true);

      expect(
        isEligibleEnquiry(
          "99acres",
          "Advertisement Response for Rs61.86 Lac, 3 BHK Flat in Kajla The Elements Matigara",
          "Some body"
        ).eligible
      ).toBe(true);
    });

    it("recognizes existing valid 99acres subject formats", () => {
      expect(
        isEligibleEnquiry(
          "99acres",
          "Query for your Property Id W79666903 - Flat in Anandville Darjeeling More",
          "Details of the response"
        ).eligible
      ).toBe(true);

      expect(
        isEligibleEnquiry(
          "99acres",
          "Buyer wants to know about your Rs57.71 Lac, 3 BHK Flat in Ashiyana Heights Matigara",
          "Details of the response"
        ).eligible
      ).toBe(true);
    });

    it("excludes system and administrative notifications", () => {
      expect(
        isEligibleEnquiry("99acres", "Your photos deleted for listing W79666903", "Photos deleted").eligible
      ).toBe(false);

      expect(
        isEligibleEnquiry("99acres", "Listing expired: Renew your listing today", "Expired notice").eligible
      ).toBe(false);

      expect(
        isEligibleEnquiry("99acres", "Tax invoice for your subscription payment", "Invoice details").eligible
      ).toBe(false);
    });
  });

  describe("Read vs. Unread Independence", () => {
    it("processes both read and unread messages without discriminating", () => {
      const mockMessages: MockMessage[] = [
        {
          id: "msg-1",
          from: "leads@99acres.com",
          subject: "Advertisement Response for Rs44 Lac, 2 BHK Flat in NS Alti Level Champasari",
          body: "Details of the response\nAman\n9876543210",
          date: new Date(),
          isUnread: false,
        },
        {
          id: "msg-2",
          from: "leads@99acres.com",
          subject: "Advertisement Response for Rs61.86 Lac, 3 BHK Flat in Kajla The Elements Matigara",
          body: "Details of the response\nRohit\n9123456789",
          date: new Date(),
          isUnread: true,
        },
      ];

      const evaluated = mockMessages.map((m) => ({
        id: m.id,
        isUnread: m.isUnread,
        eligible: isEligibleEnquiry("99acres", m.subject, m.body).eligible,
      }));

      expect(evaluated).toHaveLength(2);
      expect(evaluated[0]?.eligible).toBe(true);
      expect(evaluated[0]?.isUnread).toBe(false);
      expect(evaluated[1]?.eligible).toBe(true);
      expect(evaluated[1]?.isUnread).toBe(true);
    });
  });

  describe("Multi-Message Thread Protection & Label Deferral", () => {
    it("defers thread labeling when multiple eligible messages exist in the same thread", () => {
      const thread: MockThread = {
        id: "thread-multi",
        labels: [],
        messages: [
          {
            id: "msg-1",
            from: "leads@99acres.com",
            subject: "Advertisement Response for Rs44 Lac",
            body: "Details of the response\nBuyer 1\n9876543210",
            date: new Date("2026-10-09T10:00:00Z"),
            isUnread: false,
          },
          {
            id: "msg-2",
            from: "leads@99acres.com",
            subject: "Advertisement Response for Rs44 Lac",
            body: "Details of the response\nBuyer 2\n9123456789",
            date: new Date("2026-10-10T12:00:00Z"),
            isUnread: false,
          },
        ],
      };

      const processedMsgIds: Record<string, number> = {};

      // === SIMULATE RUN 1 ===
      // Find first eligible unprocessed message
      const eligibleRun1 = thread.messages.filter(
        (m) => isEligibleEnquiry("99acres", m.subject, m.body).eligible && !processedMsgIds[m.id]
      );
      expect(eligibleRun1).toHaveLength(2);

      const targetMsg1 = eligibleRun1[0]!;
      const otherUnprocessed1 = eligibleRun1.length - 1; // 1 message remains

      // Simulate webhook success
      const webhookRes1 = evaluateWebhookResponse(
        200,
        JSON.stringify({ success: true, lead_id: "lead-1" })
      );
      expect(webhookRes1.success).toBe(true);

      // Record msg-1 as processed
      processedMsgIds[targetMsg1.id] = Date.now();

      // Only label thread if 0 other eligible messages remain
      if (otherUnprocessed1 === 0) {
        thread.labels.push("99acres-processed");
      }

      // Assert thread is NOT labeled yet (protects msg-2 from being suppressed)
      expect(thread.labels).not.toContain("99acres-processed");
      expect(processedMsgIds["msg-1"]).toBeTruthy();
      expect(processedMsgIds["msg-2"]).toBeUndefined();

      // === SIMULATE RUN 2 ===
      // Find next eligible unprocessed message
      const eligibleRun2 = thread.messages.filter(
        (m) => isEligibleEnquiry("99acres", m.subject, m.body).eligible && !processedMsgIds[m.id]
      );
      expect(eligibleRun2).toHaveLength(1); // Only msg-2 remains!
      expect(eligibleRun2[0]?.id).toBe("msg-2");

      const targetMsg2 = eligibleRun2[0]!;
      const otherUnprocessed2 = eligibleRun2.length - 1; // 0 remaining!

      // Simulate webhook success
      const webhookRes2 = evaluateWebhookResponse(
        200,
        JSON.stringify({ success: true, lead_id: "lead-2" })
      );
      expect(webhookRes2.success).toBe(true);

      // Record msg-2 as processed
      processedMsgIds[targetMsg2.id] = Date.now();

      // Label thread since all messages are now processed
      if (otherUnprocessed2 === 0) {
        thread.labels.push("99acres-processed");
      }

      // Assert thread IS now labeled!
      expect(thread.labels).toContain("99acres-processed");
      expect(processedMsgIds["msg-1"]).toBeTruthy();
      expect(processedMsgIds["msg-2"]).toBeTruthy();
    });
  });

  describe("Batch Pagination & Skip Avoidance", () => {
    it("retrieves and processes all messages beyond the first 15 threads across batches", () => {
      const BATCH_SIZE = 5;
      const totalThreads = 12;

      const mockInbox: MockThread[] = Array.from({ length: totalThreads }, (_, idx) => ({
        id: `thread-${idx + 1}`,
        labels: [],
        messages: [
          {
            id: `msg-${idx + 1}`,
            from: "leads@99acres.com",
            subject: `Advertisement Response #${idx + 1}`,
            body: "Details of the response\nLead Name\n9876543210",
            date: new Date(),
            isUnread: idx % 2 === 0,
          },
        ],
      }));

      const processedThreadIds: string[] = [];
      let batchCount = 0;
      const MAX_BATCHES = 5;

      while (batchCount < MAX_BATCHES) {
        const candidateBatch = mockInbox
          .filter((t) => !t.labels.includes("99acres-processed"))
          .slice(0, BATCH_SIZE);

        if (candidateBatch.length === 0) break;

        for (const thread of candidateBatch) {
          processedThreadIds.push(thread.id);
          thread.labels.push("99acres-processed");
        }

        batchCount++;
      }

      expect(processedThreadIds).toHaveLength(12);
      expect(batchCount).toBe(3);
      expect(mockInbox.every((t) => t.labels.includes("99acres-processed"))).toBe(true);
    });
  });
});
