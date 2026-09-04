import { createHash } from "node:crypto";

export interface ParsedMagicBricksLead {
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  campaign_name: string | null;
  bhk_configuration: string | null;
  budget_range: string | null;
  property_id: string | null;
  external_lead_id: string;
}

export function parseMagicBricksEmail(text: string, subject?: string): ParsedMagicBricksLead {
  const safeText = text || "";
  const safeSubject = subject || "";

  const fullName = extractFullName(safeText);
  const phoneNumber = extractPhoneNumber(safeText);
  const email = extractEmail(safeText);
  const propertyId = extractPropertyId(safeText, safeSubject);
  const campaignName = extractCampaignName(safeText, safeSubject);
  const bhkConfiguration = extractBHK(safeText, safeSubject);
  const budgetRange = extractBudget(safeText);

  const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";

  let externalLeadId: string;
  if (cleanPhone) {
    externalLeadId = `MB-${propertyId || "prop"}-${cleanPhone}`;
  } else if (propertyId) {
    const hash = createHash("sha256").update(safeText.slice(0, 200)).digest("hex").slice(0, 10);
    externalLeadId = `MB-${propertyId}-${hash}`;
  } else {
    const hash = createHash("sha256").update(safeText || Date.now().toString()).digest("hex").slice(0, 16);
    externalLeadId = `MB-prop-${hash}`;
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

function extractFullName(text: string): string | null {
  const match = text.match(/Sender's Name:\s*([^\n\r(]+)/i);
  if (match && match[1]) {
    return cleanFullName(match[1]);
  }
  const fallback = text.match(/(?:Buyer Name|Customer Name|Name):\s*([^\n\r(]+)/i);
  if (fallback && fallback[1]) {
    return cleanFullName(fallback[1]);
  }
  return null;
}

function cleanFullName(raw: string): string | null {
  const trimmed = raw.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractPhoneNumber(text: string): string | null {
  const match = text.match(/Mobile:\s*([^\n\r]+)/i) || text.match(/(?:Contact Number|Phone):\s*([^\n\r]+)/i);
  if (match && match[1]) {
    return cleanToE164(match[1]);
  }
  const fallback = text.match(/(?:\+91[\s\-]?)?[6-9]\d{9}\b/);
  if (fallback && fallback[0]) {
    return cleanToE164(fallback[0]);
  }
  return null;
}

function cleanToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (match && match[1]) {
    const email = match[1].trim();
    if (!email.toLowerCase().includes("magicbricks.com")) return email;
  }
  const anyEmail = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (anyEmail && anyEmail[1]) {
    const email = anyEmail[1].trim();
    if (!email.toLowerCase().includes("magicbricks.com") && !email.toLowerCase().includes("rba")) {
      return email;
    }
  }
  return null;
}

function extractPropertyId(text: string, subject?: string): string | null {
  const combined = `${subject || ""} ${text}`;
  const match = combined.match(/Property(?:,)?\s*ID\s*[:\s]*(\d+)/i) || combined.match(/\bID\s*[:\s]*(\d{6,12})\b/i);
  if (match && match[1]) return match[1].trim();
  return null;
}

function extractCampaignName(text: string, subject?: string): string | null {
  const propMatch = text.match(/interested in your Property(?:,)?\s*ID\s*\d+\s*:\s*([^\n\r]+)/i);
  if (propMatch && propMatch[1]) {
    const cleaned = cleanProperty(propMatch[1]);
    if (cleaned) return cleaned;
  }
  const propDescMatch = text.match(/(?:Property Description|Property Name|Project Name)\s*:\s*([^\n\r]+)/i);
  if (propDescMatch && propDescMatch[1]) {
    const cleaned = cleanProperty(propDescMatch[1]);
    if (cleaned) return cleaned;
  }
  if (subject) {
    const forDashMatch = subject.match(/for\s*[-–]\s*([^\n\r]+)/i);
    if (forDashMatch && forDashMatch[1]) {
      const cleaned = cleanProperty(forDashMatch[1]);
      if (cleaned) return cleaned;
    }
    const dashMatch = subject.match(/[-–]\s*([^\n\r]+)/);
    if (dashMatch && dashMatch[1]) {
      const cleaned = cleanProperty(dashMatch[1]);
      if (cleaned) return cleaned;
    }
  }
  const typeMatch = text.match(/\b((?:\d+\s*BHK\s+)?(?:Flat|Apartment|Villa|Plot|House|Builder Floor|Commercial)\s+in\s+[^\r\n,]+)/i);
  if (typeMatch && typeMatch[1]) {
    const cleaned = cleanProperty(typeMatch[1]);
    if (cleaned) return cleaned;
  }
  return null;
}

function cleanProperty(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-|]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractBHK(text: string, subject?: string): string | null {
  const combined = `${text} ${subject || ""}`;
  const match = combined.match(/\b(\d+)\s*(?:BHK|bhk|Bedrooms?)\b/i);
  if (match && match[1]) return `${match[1]} BHK`;
  return null;
}

function extractBudget(text: string): string | null {
  const match = text.match(/(?:Price|Budget|Rent|Cost)?[:\s]*((?:Rs\.?|₹|INR)\s*[\d\.,]+\s*(?:Lac|Lakh|Crore|Cr|L|k)?)\b/i) || text.match(/\b((?:Rs\.?|₹)\s*[\d\.,]+\s*(?:Lac|Lakh|Crore|Cr|L)?)\b/i);
  if (match && match[1]) return match[1].replace(/\s+/g, " ").trim();
  return null;
}
