import type { Lead } from "./types";
import type { SalesRep } from "@/app/leads/assignment-actions";
import { sanitizePhoneForCopy } from "./formatters";

const IST_TIME_ZONE = "Asia/Kolkata";

const istExportFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Formats a UTC ISO timestamp into full Indian Standard Time with Year, e.g. "19 Sep 2026, 10:15 am". */
export function formatISTFull(isoUtc: string | null | undefined): string {
  if (!isoUtc) return "";
  try {
    const d = new Date(isoUtc);
    if (isNaN(d.getTime())) return "";
    const parts = istExportFormatter.formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const day = get("day");
    const month = get("month");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    const dayPeriod = get("dayPeriod");
    return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
  } catch {
    return "";
  }
}

/** Formats source identifier to a human-readable title. */
export function formatLeadSource(source: string | null | undefined): string {
  if (!source) return "";
  const map: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    "99acres": "99acres",
    magicbricks: "MagicBricks",
    direct_walk_in: "Direct Walk-in",
    phone_call: "Phone Call",
    referral: "Referral",
  };
  return map[source] || source;
}

/**
 * Escapes a cell value for RFC 4180 CSV compliance and neutralizes formula injection (DDE).
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number" && !isNaN(val)) {
    return String(val);
  }

  let str = String(val);

  // Prevent CSV formula injection: if cell starts with =, +, -, or @, prefix with a single quote.
  // This also forces Excel to treat strings (like +91 phone numbers) as text.
  if (/^[=+\-@]/.test(str.trim())) {
    str = `'${str}`;
  }

  // RFC 4180: If the string contains comma, double quote, or newlines, quote it and escape internal quotes.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export const EXPORT_HEADERS: readonly string[] = [
  "Lead ID",
  "Submitted Date (IST)",
  "Full Name",
  "Phone Number",
  "Email",
  "Source",
  "Platform",
  "Campaign Name",
  "Ad Group",
  "Ad Name",
  "Budget Range",
  "BHK Configuration",
  "Planning Timeline",
  "Lead Stage",
  "Call Outcome / Status",
  "Next Follow-Up (IST)",
  "Assigned Agent",
  "Assigned Date (IST)",
  "Viewed Status",
  "Needs Review",
  "Notes",
  "Token Amount (INR)",
  "Closed Date (IST)",
] as const;

/**
 * Pure generator function to convert an array of leads and sales team members
 * into an RFC 4180-compliant CSV string prefixed with UTF-8 BOM.
 * Can run either in the browser or on the server edge runtime.
 */
export function generateLeadsCsv(leads: Lead[], salesTeam: SalesRep[] = []): string {
  const salesMap = new Map<string, string>();
  for (const rep of salesTeam) {
    if (rep.id && rep.full_name) {
      salesMap.set(rep.id, rep.full_name);
    }
  }

  const headerRow = EXPORT_HEADERS.map(escapeCsvCell).join(",");

  const dataRows = leads.map((lead) => {
    const cleanPhone = sanitizePhoneForCopy(lead.phone_number);
    const assignedName = lead.assigned_to
      ? salesMap.get(lead.assigned_to) || "Assigned"
      : "Unassigned";

    const platformFormatted = lead.platform
      ? lead.platform.charAt(0).toUpperCase() + lead.platform.slice(1)
      : "";

    const notes = (lead.disposition_details?.notes as string) || "";

    const rowValues: unknown[] = [
      lead.external_lead_id || lead.id,
      formatISTFull(lead.source_submitted_at),
      lead.full_name || "",
      cleanPhone,
      lead.email || "",
      formatLeadSource(lead.source),
      platformFormatted,
      lead.campaign_name || "",
      lead.ad_group_name || "",
      lead.ad_name || "",
      lead.budget_range || "",
      lead.bhk_configuration || "",
      lead.planning_timeline || "",
      lead.lead_stage || "NEW",
      lead.disposition || lead.lead_status || "",
      formatISTFull(lead.next_follow_up),
      assignedName,
      formatISTFull(lead.assigned_at),
      lead.viewed_at ? "Viewed" : "New",
      lead.needs_staff_review ? "Yes" : "No",
      notes,
      lead.token_amount != null ? lead.token_amount : "",
      formatISTFull(lead.closed_at),
    ];

    return rowValues.map(escapeCsvCell).join(",");
  });

  // Prepend UTF-8 BOM so Excel opens Indian fonts/Rupee symbols seamlessly
  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

/**
 * Triggers a browser file download of the given CSV content.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Main export action helper: serializes leads to CSV and initiates browser download.
 */
export function exportLeadsToCsv(
  leads: Lead[],
  salesTeam: SalesRep[] = [],
  fileSuffix: string = ""
): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = fileSuffix ? `-${fileSuffix}` : "";
  const filename = `rba-leads${suffix}-${dateStr}.csv`;
  const csv = generateLeadsCsv(leads, salesTeam);
  downloadCsvFile(filename, csv);
}

