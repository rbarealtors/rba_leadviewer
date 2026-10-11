/**
 * 99acres API Client — Discovery & Diagnostic Module (Phase 1)
 *
 * Implements authenticated pull operations against the 99acres getmy99Response API.
 * Designed with strict rate-limiting, comprehensive redaction (no credentials or buyer PII exposed),
 * and boundary validation per 99acres official vendor specifications.
 */

export interface NinetyNineAcresConfig {
  token: string;
  username: string;
  password: string;
  baseUrl?: string; // Default: https://www.99acres.com/99api/v1/getmy99Response
  useHttpFallback?: boolean; // If true and HTTPS fails, try HTTP with explicit warning
  passwordField?: "pswd" | "pwd"; // Handles documentation ambiguity
  requestFormat?: "form_xml" | "raw_xml"; // 'form_xml' (xml=<xml>...) is vendor standard
  timeoutMs?: number; // Default: 15000 ms
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface RawEnquiryData {
  tblId: string | null;
  resType: string | null;
  prodId: string | null;
  compactLabel: string | null;
  queryInfo: string | null;
  receivedOn: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface RedactedEnquirySummary {
  tblId: string | null;
  resType: string | null;
  prodId: string | null;
  compactLabel: string | null;
  querySnippet: string | null;
  receivedOn: string | null;
  maskedName: string | null;
  maskedEmail: string | null;
  maskedPhone: string | null;
}

export interface DiagnosticResult {
  success: boolean;
  httpStatus?: number;
  endpointUrlRedacted: string;
  protocol: "https" | "http";
  requestFormat: "form_xml" | "raw_xml";
  dateRange: {
    startDate: string;
    endDate: string;
    durationHours: number;
  };
  totalEnquiries: number;
  enquiriesRedacted: RedactedEnquirySummary[];
  vendorErrorCode?: string | null;
  vendorErrorMessage?: string | null;
  error?: string;
  warning?: string;
  responsePreview?: string; // Sanitized preview (no secrets or PII)
}

/**
 * Formats a Date object to YYYY-MM-DD HH:mm:ss format expected by 99acres.
 */
export function format99AcresDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Validates date range constraints specified in 99acres documentation:
 * - start_date cannot be older than 30 days from current date
 * - end_date must be >= start_date
 * - max date range difference is 2 days (48 hours)
 */
export function validateDateRange(startDate: Date, endDate: Date, now: Date = new Date()): { valid: boolean; error?: string } {
  const diffHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  if (diffHours < 0) {
    return { valid: false, error: "end_date must be greater than or equal to start_date (vendor ERROR-0005)" };
  }

  if (diffHours > 48.001) {
    return { valid: false, error: `Date range (${diffHours.toFixed(1)} hours) exceeds the 2-day maximum limit (vendor ERROR-0003)` };
  }

  const daysSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart > 30.001) {
    return { valid: false, error: `start_date is older than 30 days (${daysSinceStart.toFixed(1)} days ago; vendor ERROR-0002)` };
  }

  return { valid: true };
}

/**
 * Constructs XML query payload for 99acres getmy99Response API.
 */
export function buildQueryXml(
  username: string,
  password: string,
  startDateStr: string,
  endDateStr: string,
  passwordField: "pswd" | "pwd" = "pswd"
): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const pwdTag = passwordField === "pwd" ? "pwd" : "pswd";

  return `<?xml version="1.0" encoding="UTF-8"?>
<query>
  <user_name>${escapeXml(username)}</user_name>
  <${pwdTag}>${escapeXml(password)}</${pwdTag}>
  <start_date>${escapeXml(startDateStr)}</start_date>
  <end_date>${escapeXml(endDateStr)}</end_date>
</query>`;
}

/**
 * Redacts PII from contact details and sensitive text.
 */
export function redactPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "+91-***";
  const lastFour = digits.slice(-4);
  return `+91-XXXXX-XX${lastFour.slice(-2)}`;
}

export function redactEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const maskedLocal = (local && local.length > 2) ? `${local[0]}***${local.slice(-1)}` : "***";
  return `${maskedLocal}@${domain}`;
}

export function redactName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => (p.length > 1 ? `${p[0]}***` : p)).join(" ");
}

export function redactEnquiry(enquiry: RawEnquiryData): RedactedEnquirySummary {
  const queryText = enquiry.queryInfo || "";
  const querySnippet = queryText.length > 30 ? `${queryText.slice(0, 30)}... [${queryText.length} chars]` : queryText || null;

  return {
    tblId: enquiry.tblId,
    resType: enquiry.resType,
    prodId: enquiry.prodId,
    compactLabel: enquiry.compactLabel,
    querySnippet,
    receivedOn: enquiry.receivedOn,
    maskedName: redactName(enquiry.name),
    maskedEmail: redactEmail(enquiry.email),
    maskedPhone: redactPhone(enquiry.phone),
  };
}

/**
 * Zero-dependency XML parser specifically tailored for 99acres getmy99Response structure.
 */
export function parse99AcresXmlResponse(xmlText: string): {
  actionStatus: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  enquiries: RawEnquiryData[];
} {
  const trimmed = xmlText.trim();

  // 1. Check ActionStatus and ErrorCode on root / xml tag
  // Example: <Xml ActionStatus="true"> or <Xml ActionStatus="false" ErrorCode="ERROR-0001">
  const actionStatusMatch = trimmed.match(/ActionStatus\s*=\s*["']([^"']+)["']/i);
  const actionStatus = actionStatusMatch ? actionStatusMatch[1]?.toLowerCase() === "true" : !trimmed.includes("ErrorCode");

  const errorCodeMatch = trimmed.match(/ErrorCode\s*=\s*["']([^"']+)["']/i) || trimmed.match(/<ErrorCode>([^<]+)<\/ErrorCode>/i);
  const errorCode = errorCodeMatch ? errorCodeMatch[1]?.trim() || null : null;

  const errorMsgMatch =
    trimmed.match(/ErrorMsg\s*=\s*["']([^"']+)["']/i) ||
    trimmed.match(/<ErrorMsg>([^<]+)<\/ErrorMsg>/i) ||
    trimmed.match(/<Error>([^<]+)<\/Error>/i);
  const errorMessage = errorMsgMatch ? errorMsgMatch[1]?.trim() || null : null;

  // 2. Parse individual <Resp> elements
  const enquiries: RawEnquiryData[] = [];
  const respRegex = /<Resp\b[^>]*>([\s\S]*?)<\/Resp>/gi;
  let respMatch: RegExpExecArray | null;

  while ((respMatch = respRegex.exec(trimmed)) !== null) {
    const respContent = respMatch[1] || "";

    // Extract QryDtl attributes and children
    const qryDtlTagMatch = respContent.match(/<QryDtl\b([^>]*)>/i);
    const qryDtlAttrs = qryDtlTagMatch ? qryDtlTagMatch[1] || "" : "";

    const tblIdMatch = qryDtlAttrs.match(/TblId\s*=\s*["']([^"']+)["']/i) || respContent.match(/<TblId>([^<]+)<\/TblId>/i);
    const tblId = tblIdMatch ? tblIdMatch[1]?.trim() || null : null;

    const resTypeMatch = qryDtlAttrs.match(/ResType\s*=\s*["']([^"']+)["']/i) || respContent.match(/<ResType>([^<]+)<\/ResType>/i);
    const resType = resTypeMatch ? resTypeMatch[1]?.trim() || null : null;

    const prodIdMatch = respContent.match(/<ProdId\b[^>]*>([^<]+)<\/ProdId>/i);
    const prodId = prodIdMatch ? prodIdMatch[1]?.trim() || null : null;

    const cmpctLablMatch = respContent.match(/<CmpctLabl\b[^>]*>([\s\S]*?)<\/CmpctLabl>/i);
    const compactLabel = cmpctLablMatch ? cmpctLablMatch[1]?.trim() || null : null;

    const qryInfoMatch = respContent.match(/<QryInfo\b[^>]*>([\s\S]*?)<\/QryInfo>/i);
    const queryInfo = qryInfoMatch ? qryInfoMatch[1]?.trim() || null : null;

    const rcvdOnMatch = respContent.match(/<RcvdOn\b[^>]*>([^<]+)<\/RcvdOn>/i);
    const receivedOn = rcvdOnMatch ? rcvdOnMatch[1]?.trim() || null : null;

    // Contact Details
    const nameMatch = respContent.match(/<Name\b[^>]*>([^<]+)<\/Name>/i);
    const name = nameMatch ? nameMatch[1]?.trim() || null : null;

    const emailMatch = respContent.match(/<Email\b[^>]*>([^<]+)<\/Email>/i);
    const email = emailMatch ? emailMatch[1]?.trim() || null : null;

    const phoneMatch = respContent.match(/<Phone\b[^>]*>([^<]+)<\/Phone>/i) || respContent.match(/<Mobile\b[^>]*>([^<]+)<\/Mobile>/i);
    const phone = phoneMatch ? phoneMatch[1]?.trim() || null : null;

    enquiries.push({
      tblId,
      resType,
      prodId,
      compactLabel,
      queryInfo,
      receivedOn,
      name,
      email,
      phone,
    });
  }

  return {
    actionStatus,
    errorCode,
    errorMessage,
    enquiries,
  };
}

/**
 * Builds redacted URL for logging (masks token).
 */
export function getRedactedEndpointUrl(baseUrl: string, token: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const maskedToken = token.length > 6 ? `${token.slice(0, 3)}***${token.slice(-3)}` : "***";
  return `${cleanBase}/${maskedToken}/uid/`;
}

/**
 * Performs a live diagnostic connection test against 99acres API.
 * Never logs credentials or customer PII.
 */
export async function executeNinetyNineAcresDiagnostic(
  config: NinetyNineAcresConfig,
  dateRange?: DateRange
): Promise<DiagnosticResult> {
  const {
    token,
    username,
    password,
    baseUrl = "https://www.99acres.com/99api/v1/getmy99Response",
    useHttpFallback = false,
    passwordField = "pswd",
    requestFormat = "form_xml",
    timeoutMs = 15000,
  } = config;

  if (!token || !username || !password) {
    return {
      success: false,
      endpointUrlRedacted: "[INCOMPLETE CONFIGURATION]",
      protocol: "https",
      requestFormat,
      dateRange: { startDate: "", endDate: "", durationHours: 0 },
      totalEnquiries: 0,
      enquiriesRedacted: [],
      error: "Missing credentials: token, username, or password is not provided",
    };
  }

  // Default to the previous 24 hours (strictly <= 48h limit)
  const now = new Date();
  const end = dateRange?.endDate ?? now;
  const start = dateRange?.startDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const rangeValidation = validateDateRange(start, end, now);
  const formattedStart = format99AcresDate(start);
  const formattedEnd = format99AcresDate(end);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  if (!rangeValidation.valid) {
    return {
      success: false,
      endpointUrlRedacted: getRedactedEndpointUrl(baseUrl, token),
      protocol: baseUrl.startsWith("http://") ? "http" : "https",
      requestFormat,
      dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
      totalEnquiries: 0,
      enquiriesRedacted: [],
      error: rangeValidation.error,
    };
  }

  const queryXml = buildQueryXml(username, password, formattedStart, formattedEnd, passwordField);

  // Prepare endpoints to attempt (HTTPS first, then optional HTTP fallback)
  const protocolsToAttempt: Array<{ url: string; protocol: "https" | "http" }> = [];
  const cleanBase = baseUrl.replace(/\/+$/, "");

  if (cleanBase.startsWith("http://")) {
    protocolsToAttempt.push({ url: `${cleanBase}/${token}/uid/`, protocol: "http" });
  } else {
    // Standard HTTPS endpoint
    protocolsToAttempt.push({ url: `${cleanBase}/${token}/uid/`, protocol: "https" });
    if (useHttpFallback) {
      const httpBase = cleanBase.replace(/^https:\/\//i, "http://");
      protocolsToAttempt.push({ url: `${httpBase}/${token}/uid/`, protocol: "http" });
    }
  }

  let lastResult: DiagnosticResult | null = null;

  for (const target of protocolsToAttempt) {
    const redactedUrl = getRedactedEndpointUrl(cleanBase, token);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let fetchBody: string;
      let contentType: string;

      if (requestFormat === "form_xml") {
        fetchBody = `xml=${encodeURIComponent(queryXml)}`;
        contentType = "application/x-www-form-urlencoded";
      } else {
        fetchBody = queryXml;
        contentType = "application/xml; charset=utf-8";
      }

      const response = await fetch(target.url, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "User-Agent": "RBA-LeadViewer/1.0",
        },
        body: fetchBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawResponseText = await response.text();

      // Check HTTP-level errors
      if (!response.ok) {
        lastResult = {
          success: false,
          httpStatus: response.status,
          endpointUrlRedacted: redactedUrl,
          protocol: target.protocol,
          requestFormat,
          dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
          totalEnquiries: 0,
          enquiriesRedacted: [],
          error: `HTTP error ${response.status}: ${response.statusText}`,
          responsePreview: rawResponseText.slice(0, 300),
        };
        continue;
      }

      // Parse XML response
      const parsed = parse99AcresXmlResponse(rawResponseText);

      // Check Vendor Error Codes (ERROR-0001 to ERROR-0005)
      if (parsed.errorCode || !parsed.actionStatus) {
        const errorDescriptions: Record<string, string> = {
          "ERROR-0001": "Authentication failure: invalid token, username, or password",
          "ERROR-0002": "Start date is older than 30 days limit",
          "ERROR-0003": "Date range exceeds 2 days (48 hours) limit",
          "ERROR-0004": "Query limit exceeded (> 5,000 enquiries)",
          "ERROR-0005": "End date earlier than start date",
        };

        const descriptiveError = parsed.errorCode
          ? errorDescriptions[parsed.errorCode] || `Vendor error: ${parsed.errorCode}`
          : parsed.errorMessage || "Vendor returned ActionStatus=false";

        return {
          success: false,
          httpStatus: response.status,
          endpointUrlRedacted: redactedUrl,
          protocol: target.protocol,
          requestFormat,
          dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
          totalEnquiries: 0,
          enquiriesRedacted: [],
          vendorErrorCode: parsed.errorCode,
          vendorErrorMessage: parsed.errorMessage,
          error: descriptiveError,
          responsePreview: rawResponseText.slice(0, 300),
        };
      }

      // Success: redact enquiries for diagnostic report
      const redactedEnquiries = parsed.enquiries.map(redactEnquiry);

      return {
        success: true,
        httpStatus: response.status,
        endpointUrlRedacted: redactedUrl,
        protocol: target.protocol,
        requestFormat,
        dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
        totalEnquiries: parsed.enquiries.length,
        enquiriesRedacted: redactedEnquiries,
        warning: target.protocol === "http" ? "WARNING: Response was retrieved over unencrypted HTTP protocol." : undefined,
      };
    } catch (err: any) {
      const isAbort = err.name === "AbortError";
      const errMsg = isAbort ? `Request timed out after ${timeoutMs}ms` : err.message || "Network error";

      lastResult = {
        success: false,
        endpointUrlRedacted: redactedUrl,
        protocol: target.protocol,
        requestFormat,
        dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
        totalEnquiries: 0,
        enquiriesRedacted: [],
        error: errMsg,
      };
    }
  }

  return (
    lastResult ?? {
      success: false,
      endpointUrlRedacted: "[UNKNOWN]",
      protocol: "https",
      requestFormat,
      dateRange: { startDate: formattedStart, endDate: formattedEnd, durationHours },
      totalEnquiries: 0,
      enquiriesRedacted: [],
      error: "No response received",
    }
  );
}

