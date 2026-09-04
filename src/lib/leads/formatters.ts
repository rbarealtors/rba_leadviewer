/**
 * Utilities for formatting lead data on the leads dashboard.
 */

/**
 * Sanitizes a phone number for use with WhatsApp Web / Click-to-Chat.
 * WhatsApp requires only digits with a country code, omitting any '+' or leading zeros.
 * Standard Indian numbers (10 digits) have country code '91' prepended.
 */
export function sanitizePhoneForWhatsApp(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip any 'p:' prefix from Meta and remove all non-digits
  const digits = raw.replace(/^p:/i, "").replace(/\D/g, "");
  if (!digits) return "";

  // 10-digit Indian phone number
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // 11-digit phone number with leading 0 (e.g. 09834500000)
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

/**
 * Builds the WhatsApp Web click-to-chat URL with pre-filled greeting text.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  fullName: string | null | undefined,
  campaignName: string | null | undefined
): string {
  const sanitizedPhone = sanitizePhoneForWhatsApp(phone);
  if (!sanitizedPhone) return "";
  const name = fullName && fullName.trim().length > 0 ? fullName.trim() : "there";
  const campaign = campaignName && campaignName.trim().length > 0 ? campaignName.trim() : "our property";
  const text = encodeURIComponent(`Hi ${name}, reaching out from RBA Realtors regarding your inquiry on ${campaign}.`);
  return `https://web.whatsapp.com/send?phone=${sanitizedPhone}&text=${text}`;
}

/**
 * Sanitizes a phone number for clipboard copying.
 * Strips Meta's 'p:' transport prefix and trims whitespace.
 */
export function sanitizePhoneForCopy(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/^p:/i, "");
  return trimmed;
}

export interface FormattedCampaign {
  title: string;
  badges: string[];
}

const MONTH_NAMES: Record<string, string> = {
  jan: "Jan",
  feb: "Feb",
  mar: "Mar",
  apr: "Apr",
  may: "May",
  jun: "Jun",
  jul: "Jul",
  aug: "Aug",
  sep: "Sep",
  sept: "Sep",
  oct: "Oct",
  nov: "Nov",
  dec: "Dec",
};

/**
 * Cleans up campaign slugs by replacing underscores with spaces,
 * capitalizing words into Title Case, and extracting trailing specification
 * tags (e.g. dates, BHK, phase, size) as secondary badges.
 */
export function formatCampaignName(raw: string | null | undefined): FormattedCampaign {
  if (!raw || !raw.trim()) {
    return { title: "—", badges: [] };
  }

  // Replace underscores and consecutive whitespace with single spaces
  let text = raw.replace(/_+/g, " ").trim();
  const badges: string[] = [];

  // Patterns for trailing tags to extract as badges
  // We extract from the end repeatedly until no trailing tag matches
  let matched = true;
  while (matched && text.length > 0) {
    matched = false;

    // Trailing month+year e.g. "sep2026", "sep 2026", "nov25", "oct_2025"
    const monthYearMatch = text.match(/(?:^|[\s\-|])(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{2,4})$/i);
    if (monthYearMatch && monthYearMatch[1] && monthYearMatch[2]) {
      const month = MONTH_NAMES[monthYearMatch[1].toLowerCase()] || monthYearMatch[1];
      const year = monthYearMatch[2];
      badges.unshift(`${month} ${year}`);
      text = text.slice(0, text.length - monthYearMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Trailing BHK e.g. "3bhk", "2 bhk", "4 BHK"
    const bhkMatch = text.match(/(?:^|[\s\-|])(\d+)\s*bhk$/i);
    if (bhkMatch && bhkMatch[1]) {
      badges.unshift(`${bhkMatch[1]} BHK`);
      text = text.slice(0, text.length - bhkMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Trailing area size e.g. "1200sqft", "1000 sqft"
    const sqftMatch = text.match(/(?:^|[\s\-|])(\d+)\s*sq[\.\s]*ft$/i);
    if (sqftMatch && sqftMatch[1]) {
      badges.unshift(`${sqftMatch[1]} sqft`);
      text = text.slice(0, text.length - sqftMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Trailing phase e.g. "phase 1", "phase1"
    const phaseMatch = text.match(/(?:^|[\s\-|])phase\s*(\d+)$/i);
    if (phaseMatch && phaseMatch[1]) {
      badges.unshift(`Phase ${phaseMatch[1]}`);
      text = text.slice(0, text.length - phaseMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Trailing standalone year e.g. "2026", "2025"
    const yearMatch = text.match(/(?:^|[\s\-|])(20\d{2})$/);
    if (yearMatch && yearMatch[1]) {
      badges.unshift(yearMatch[1]);
      text = text.slice(0, text.length - yearMatch[0].length).trim();
      matched = true;
      continue;
    }
  }

  // Clean any leftover trailing hyphens or pipes
  text = text.replace(/[\s\-|]+$/, "").trim();

  // If text became empty because the entire campaign was tags, fallback
  if (!text) {
    text = raw.replace(/_+/g, " ").trim();
    badges.length = 0;
  }

  // Capitalize words cleanly
  const words = text.split(/\s+/);
  const formattedTitle = words
    .map((w) => {
      // If the word has hyphens (e.g. sector-5), capitalize segments
      if (w.includes("-")) {
        return w
          .split("-")
          .map((sub) => capitalizeWord(sub))
          .join("-");
      }
      return capitalizeWord(w);
    })
    .join(" ");

  return {
    title: formattedTitle,
    badges,
  };
}

const KNOWN_ACRONYMS: Record<string, string> = {
  rba: "RBA",
  nri: "NRI",
  nh: "NH",
  bhk: "BHK",
};

function capitalizeWord(w: string): string {
  if (!w) return "";
  const lower = w.toLowerCase();
  if (KNOWN_ACRONYMS[lower]) {
    return KNOWN_ACRONYMS[lower];
  }
  // If word is already all-uppercase (e.g. "RBA", "NRI", "V2"), preserve it
  if (w.length > 1 && w === w.toUpperCase() && !/\d/.test(w)) {
    return w;
  }
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
