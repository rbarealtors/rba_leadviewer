/**
 * 99acres API Diagnostic Runner (Phase 1)
 *
 * Usage:
 *   npx tsx scripts/test-99acres-connection.ts
 *
 * Requires environment variables (e.g. in .env.local):
 *   ACRES99_API_TOKEN
 *   ACRES99_USERNAME
 *   ACRES99_PASSWORD
 *
 * Optional:
 *   ACRES99_BASE_URL (defaults to https://www.99acres.com/99api/v1/getmy99Response)
 *   ACRES99_USE_HTTP (set to 'true' to allow HTTP fallback if HTTPS fails)
 *   ACRES99_PASSWORD_FIELD ('pswd' [default] or 'pwd')
 *   ACRES99_REQUEST_FORMAT ('form_xml' [default] or 'raw_xml')
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  executeNinetyNineAcresDiagnostic,
  validateDateRange,
  type NinetyNineAcresConfig,
  type DiagnosticResult,
} from "../src/lib/leads/ninety-nine-acres-client";

// Rate limiting state file to prevent exceeding vendor 6 requests / hour
const RATE_LIMIT_FILE = path.join(process.cwd(), ".acres99_rate_limit.json");
const MAX_REQUESTS_PER_HOUR = 6;
const ONE_HOUR_MS = 60 * 60 * 1000;

interface RateLimitState {
  history: number[]; // Epoch timestamps of requests in the last hour
}

function checkAndRecordRateLimit(): { allowed: boolean; remaining: number; waitMinutes?: number } {
  let state: RateLimitState = { history: [] };
  const now = Date.now();

  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const content = fs.readFileSync(RATE_LIMIT_FILE, "utf-8");
      state = JSON.parse(content);
    }
  } catch {
    state = { history: [] };
  }

  // Filter requests within the last hour
  state.history = (state.history || []).filter((ts) => now - ts < ONE_HOUR_MS);

  if (state.history.length >= MAX_REQUESTS_PER_HOUR) {
    const oldest = state.history[0] || now;
    const waitMs = ONE_HOUR_MS - (now - oldest);
    const waitMinutes = Math.ceil(waitMs / 60000);
    return { allowed: false, remaining: 0, waitMinutes };
  }

  // Record this attempt
  state.history.push(now);
  try {
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    // Non-fatal if filesystem is read-only
  }

  return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR - state.history.length };
}

// Simple .env.local loader for standalone execution
function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function main() {
  loadEnvLocal();

  console.log("==================================================================");
  console.log("  RBA CRM: 99acres API Integration — Diagnostic Connection Test   ");
  console.log("==================================================================\n");

  const token = process.env.ACRES99_API_TOKEN;
  const username = process.env.ACRES99_USERNAME;
  const password = process.env.ACRES99_PASSWORD;
  const baseUrl = process.env.ACRES99_BASE_URL || "https://www.99acres.com/99api/v1/getmy99Response";
  const useHttpFallback = process.env.ACRES99_USE_HTTP === "true";
  const passwordField = (process.env.ACRES99_PASSWORD_FIELD as "pswd" | "pwd") || "pswd";
  const requestFormat = (process.env.ACRES99_REQUEST_FORMAT as "form_xml" | "raw_xml") || "form_xml";

  if (!token || !username || !password) {
    console.error("❌ Configuration Missing:\n");
    console.error("The following environment variables are required to test the 99acres API:");
    console.error(`  - ACRES99_API_TOKEN   : ${token ? "SET [REDACTED]" : "MISSING"}`);
    console.error(`  - ACRES99_USERNAME    : ${username ? username : "MISSING"}`);
    console.error(`  - ACRES99_PASSWORD    : ${password ? "SET [REDACTED]" : "MISSING"}`);
    console.error("\nPlease add them to .env.local (do not commit secrets) and run again:");
    console.error("  ACRES99_API_TOKEN=<token_from_vendor_document>");
    console.error("  ACRES99_USERNAME=<your_99acres_username>");
    console.error("  ACRES99_PASSWORD=<your_99acres_password>\n");
    process.exit(1);
  }

  // Rate limit protection
  const rateLimitCheck = checkAndRecordRateLimit();
  if (!rateLimitCheck.allowed) {
    console.error("⚠️ RATE LIMIT SAFETY TRIGGERED:");
    console.error(
      `Vendor limits requests to ${MAX_REQUESTS_PER_HOUR} per hour. You have reached the hourly limit.`
    );
    console.error(`Please wait ${rateLimitCheck.waitMinutes} minute(s) before attempting another request.\n`);
    process.exit(1);
  }

  console.log(`[Rate Limiter] Requests remaining this hour: ${rateLimitCheck.remaining} / ${MAX_REQUESTS_PER_HOUR}`);

  // Test with past 24 hours
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endDate = now;

  console.log(`[Target Config] Base URL      : ${baseUrl}`);
  console.log(`[Target Config] Username      : ${username}`);
  console.log(`[Target Config] Pwd Field     : <${passwordField}>`);
  console.log(`[Target Config] Format        : ${requestFormat}`);
  console.log(`[Target Config] Query Window  : ${startDate.toISOString()} to ${endDate.toISOString()} (24 hrs)`);
  console.log(`[Security] Credentials and buyer PII will NOT be logged.\n`);

  console.log("Sending diagnostic request to 99acres...");
  const config: NinetyNineAcresConfig = {
    token,
    username,
    password,
    baseUrl,
    useHttpFallback,
    passwordField,
    requestFormat,
    timeoutMs: 15000,
  };

  const result: DiagnosticResult = await executeNinetyNineAcresDiagnostic(config, {
    startDate,
    endDate,
  });

  console.log("\n------------------------------------------------------------------");
  console.log("                        DIAGNOSTIC RESULT                         ");
  console.log("------------------------------------------------------------------");
  console.log(`Endpoint (Redacted) : ${result.endpointUrlRedacted}`);
  console.log(`Protocol Tested     : ${result.protocol.toUpperCase()}`);
  console.log(`HTTP Status         : ${result.httpStatus ?? "N/A"}`);
  console.log(`Connection Success  : ${result.success ? "YES ✅" : "NO ❌"}`);

  if (result.warning) {
    console.log(`\n⚠️ ${result.warning}`);
  }

  if (!result.success) {
    console.error(`\n❌ Error Details:`);
    console.error(`  Error Code        : ${result.vendorErrorCode ?? "N/A"}`);
    console.error(`  Error Description : ${result.error}`);
    if (result.vendorErrorMessage) {
      console.error(`  Vendor Message    : ${result.vendorErrorMessage}`);
    }
    if (result.responsePreview) {
      console.error(`  Response Preview  : ${result.responsePreview}`);
    }
    console.log("\n------------------------------------------------------------------");
    process.exit(1);
  }

  console.log(`Total Enquiries Ret : ${result.totalEnquiries}`);

  if (result.totalEnquiries === 0) {
    console.log("\nℹ️ Valid response received! No enquiries were logged in the past 24 hours.");
  } else {
    console.log("\nEnquiry Sample (Redacted — No Buyer PII):");
    result.enquiriesRedacted.slice(0, 3).forEach((item, index) => {
      console.log(`\n  Lead #${index + 1}:`);
      console.log(`    TblId (Enquiry ID) : ${item.tblId ?? "N/A"}`);
      console.log(`    ProdId (Property)  : ${item.prodId ?? "N/A"}`);
      console.log(`    Property Label     : ${item.compactLabel ?? "N/A"}`);
      console.log(`    Received Timestamp : ${item.receivedOn ?? "N/A"}`);
      console.log(`    Masked Name        : ${item.maskedName ?? "N/A"}`);
      console.log(`    Masked Phone       : ${item.maskedPhone ?? "N/A"}`);
      console.log(`    Masked Email       : ${item.maskedEmail ?? "N/A"}`);
      console.log(`    Query Snippet      : ${item.querySnippet ?? "N/A"}`);
    });

    if (result.totalEnquiries > 3) {
      console.log(`\n  ... and ${result.totalEnquiries - 3} more lead(s).`);
    }
  }

  console.log("\n------------------------------------------------------------------");
  console.log("Phase 1 Diagnostic complete. Production database was not modified.");
  console.log("------------------------------------------------------------------\n");
}

main().catch((err) => {
  console.error("Unexpected diagnostic error:", err);
  process.exit(1);
});

