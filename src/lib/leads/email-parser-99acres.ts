import { createHash } from "node:crypto";

export interface Parsed99AcresLead {
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  campaign_name: string | null;
  bhk_configuration: string | null;
  budget_range: string | null;
  property_id: string | null;
  external_lead_id: string;
}

/**
 * Parses plain text / notification email from 99acres into structured lead data.
 */
export function parse99AcresEmail(text: string, subject?: string): Parsed99AcresLead {
  const safeText = text || "";
  const safeSubject = subject || "";

  const fullName = extractFullName(safeText);
  const phoneNumber = extractPhoneNumber(safeText);
  const email = extractEmail(safeText);
  const campaignName = extractProperty(safeText, safeSubject);
  const bhkConfiguration = extractBHK(safeText, safeSubject);
  const budgetRange = extractBudget(safeText);
  const propertyId = extractPropertyId(safeText, safeSubject);

  // Clean phone digits for ID generation (e.g. "918054549678")
  const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";

  // Deterministic external_lead_id: ${propertyId}-${cleanPhone}
  // Falling back to a deterministic hash if propertyId is missing
  let externalLeadId: string;
  if (propertyId && cleanPhone) {
    externalLeadId = `${propertyId}-${cleanPhone}`;
  } else if (propertyId) {
    externalLeadId = `${propertyId}-${createHash("sha256").update(safeText.slice(0, 200)).digest("hex").slice(0, 12)}`;
  } else if (cleanPhone) {
    externalLeadId = `99acres-${cleanPhone}-${createHash("sha256").update(safeSubject || safeText.slice(0, 100)).digest("hex").slice(0, 10)}`;
  } else {
    externalLeadId = `99acres-${createHash("sha256").update(safeText || Date.now().toString()).digest("hex").slice(0, 16)}`;
  }

  return {
    full_name: fullName,
    phone_number: phoneNumber,
    email,
    campaign_name: campaignName,
    bhk_configuration: bhkConfiguration,
    budget_range: budgetRange,
    property_id: propertyId,
    external_lead_id: externalLeadId,
  };
}

/**
 * Extracts full name, specifically targeting the text right below
 * "Details of the response" / "Response Details".
 */
function extractFullName(text: string): string | null {
  // Pattern 1: Look for "Details of the response" followed by non-empty line
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    if (/^details of the response\b/i.test(line)) {
      // Find the next non-blank line
      for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
        const nextLine = lines[j] || "";
        if (
          nextLine.length > 0 &&
          !/^(:|-|\+?\d|phone|mobile|email|property)/i.test(nextLine)
        ) {
          return nextLine;
        }
      }
    }
  }

  // Pattern 2: Regex across full text
  const match = text.match(/(?:Details of the response|Response Details)[:\s]*\r?\n+([^\r\n]+)/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (candidate && !/^(\+?\d|email:|phone:|mobile:)/i.test(candidate)) {
      return candidate;
    }
  }

  // Fallback: Labelled Name
  const fallback = text.match(/(?:Name|Contact Person|Sender)[:\s]+([^\r\n]+)/i);
  if (fallback && fallback[1]) {
    return fallback[1].trim();
  }

  return null;
}

/**
 * Extracts and cleans Indian phone number into E.164 format (+91XXXXXXXXXX).
 */
function extractPhoneNumber(text: string): string | null {
  const patterns = [
    // Preceded by phone/mobile labels
    /(?:Mobile|Phone|Contact Number|Contact No|Tel)[:\s]*([+\d][\d\s\-.()]{8,16}\d)/i,
    // Explicit +91 Indian format with dashes/spaces
    /(\+91[\s\-]?[6-9]\d{9})\b/,
    // 91 prefix without plus
    /\b(91[\s\-]?[6-9]\d{9})\b/,
    // 11-digit leading 0
    /\b(0[6-9]\d{9})\b/,
    // Standard 10-digit Indian mobile
    /\b([6-9]\d{9})\b/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const e164 = toE164(m[1]);
      if (e164) return e164;
    }
  }

  return null;
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Standard 10-digit Indian number
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  // 12-digit Indian number with country code 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  // 11-digit number with leading 0
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Extracts contact email if present in inquirer details.
 */
function extractEmail(text: string): string | null {
  const emailMatch =
    text.match(/(?:Email|Email ID)[:\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i) ||
    text.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);

  if (emailMatch && emailMatch[1]) {
    const email = emailMatch[1].trim();
    // Exclude system/portal notification addresses
    if (!email.toLowerCase().includes("99acres.com") && !email.toLowerCase().includes("rba")) {
      return email;
    }
  }
  return null;
}

/**
 * Extracts Property Name / Title for campaign_name.
 */
function extractProperty(text: string, subject?: string): string | null {
  // 1. Check subject if it has "Property Id ... - <Property Name>"
  if (subject) {
    const dashMatch = subject.match(/(?:Property\s*Id[:\s]*[A-Za-z0-9]+)?\s*[-–]\s*([^\r\n]+)/i);
    if (dashMatch && dashMatch[1]) {
      const cleaned = cleanPropertyStr(dashMatch[1]);
      if (cleaned && !/^(Property|Details|Query|Id:)/i.test(cleaned)) return cleaned;
    }
  }

  // 2. Look for lines under "Property Details" section in body
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    if (/^property details\b/i.test(line)) {
      for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
        const nextLine = lines[j] || "";
        // Skip Property ID line, Configuration, Price, etc.
        if (
          nextLine.length > 0 &&
          !/^property\s*id/i.test(nextLine) &&
          !/^(configuration|price|budget|bhk|posted|id:|w\d+)/i.test(nextLine)
        ) {
          const cleaned = cleanPropertyStr(nextLine);
          if (cleaned) return cleaned;
        }
      }
    }
  }

  // 3. Explicit "Property: <name>" or "Project: <name>" on its own line
  const propLineMatch = text.match(/^(?:Property(?:\s*Name|\s*Title)?|Project(?:\s*Name)?)\s*[:\-]\s*([^\r\n]+)/im);
  if (propLineMatch && propLineMatch[1]) {
    const cleaned = cleanPropertyStr(propLineMatch[1]);
    if (cleaned && !/^(details|id:|w\d+)/i.test(cleaned)) return cleaned;
  }

  // 4. Specific residential property phrase in body (e.g. "Flat in Anandville Darjeeling More")
  const typeMatch = text.match(
    /\b((?:Flat|Apartment|Villa|Plot|Commercial|House|Builder Floor|Residential Land)\s+in\s+[^\r\n,]+)/i
  );
  if (typeMatch && typeMatch[1]) {
    const cleaned = cleanPropertyStr(typeMatch[1]);
    if (cleaned) return cleaned;
  }

  // 5. Fallback: Parse from subject line
  if (subject) {
    const parenMatch = subject.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      const cleaned = cleanPropertyStr(parenMatch[1]);
      if (cleaned && !/^[A-Z]\d+$/i.test(cleaned)) return cleaned;
    }

    const subTypeMatch = subject.match(
      /\b((?:Flat|Apartment|Villa|Plot|House|Builder Floor)\s+in\s+[^\r\n,]+)/i
    );
    if (subTypeMatch && subTypeMatch[1]) {
      const cleaned = cleanPropertyStr(subTypeMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function cleanPropertyStr(raw: string): string | null {
  const cleaned = raw
    .replace(/^(Property Details|Details of the Property|Query for)\s*[:\-]?\s*/i, "")
    .replace(/[\s\-|]+$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Extracts BHK configuration (e.g. "3 BHK").
 */
function extractBHK(text: string, subject?: string): string | null {
  const combined = `${text} ${subject || ""}`;
  const m = combined.match(/\b(\d+)\s*(?:BHK|bhk|Bedrooms?)\b/i);
  if (m && m[1]) {
    return `${m[1]} BHK`;
  }
  return null;
}

/**
 * Extracts Budget / Price (e.g. "Rs67.12 Lac").
 */
function extractBudget(text: string): string | null {
  const m =
    text.match(/(?:Price|Budget|Rent|Cost)[:\s]*((?:Rs\.?|₹|INR)\s*[\d\.,]+\s*(?:Lac|Lakh|Crore|Cr|L|k)?)\b/i) ||
    text.match(/\b((?:Rs\.?|₹)\s*[\d\.,]+\s*(?:Lac|Lakh|Crore|Cr|L)?)\b/i);

  if (m && m[1]) {
    return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

/**
 * Extracts 99acres Property ID (e.g. "W79666903").
 */
function extractPropertyId(text: string, subject?: string): string | null {
  const combined = `${subject || ""} ${text}`;
  // 1. Explicit Property Id label
  const labelMatch = combined.match(/(?:Property\s*Id|Prop\s*Id|Property\s*Code)[:\s]*([A-Za-z0-9]+)/i);
  if (labelMatch && labelMatch[1]) {
    return labelMatch[1].trim();
  }

  // 2. Standard 99acres Property ID format: letter + 7 to 9 digits (e.g. W79666903)
  const codeMatch = combined.match(/\b([A-Z]\d{7,10})\b/);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1].trim();
  }

  return null;
}
