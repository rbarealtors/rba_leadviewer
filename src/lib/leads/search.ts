import type { Lead, NormalizedLead } from "./types";

/** The composite key deduplication is defined against. */
export function dedupeKey(lead: Pick<NormalizedLead, "source" | "external_lead_id">): string {
  return `${lead.source}:${lead.external_lead_id}`;
}

/**
 * Case-insensitive partial match across every searchable field. Pulled out
 * as a pure function so it's unit-testable independent of React state.
 */
export function matchesSearch(lead: Lead, rawTerm: string): boolean {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;

  const haystack = [
    lead.full_name,
    lead.phone_number,
    lead.email,
    lead.campaign_name,
    lead.ad_group_name,
    lead.ad_name,
    lead.budget_range,
    lead.bhk_configuration,
    lead.planning_timeline,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}
