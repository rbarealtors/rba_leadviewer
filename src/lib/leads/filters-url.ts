import type { LeadSource } from "./types";

export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last7days"
  | "last30"
  | "last30days"
  | "thisMonth"
  | "all"
  | "custom";

export type SortKey = "time" | "name" | "budget" | "bhk";
export type ViewMode = "all" | "new" | "needs_review";

export interface LeadsFilterParams {
  search: string;
  source: LeadSource | "all";
  campaign: string;
  adGroup: string;
  budget: string;
  bhk: string;
  planning: string;
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  view: ViewMode;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

export const DEFAULT_FILTER_PARAMS: LeadsFilterParams = {
  search: "",
  source: "all",
  campaign: "all",
  adGroup: "all",
  budget: "all",
  bhk: "all",
  planning: "all",
  datePreset: "today",
  customFrom: "",
  customTo: "",
  view: "all",
  sortKey: "time",
  sortDir: "desc",
};

const VALID_SOURCES: Set<string> = new Set([
  "all",
  "google_ads",
  "meta_ads",
  "99acres",
  "magicbricks",
  "direct_walk_in",
  "phone_call",
  "referral",
]);

const VALID_DATE_PRESETS: Set<string> = new Set([
  "today",
  "yesterday",
  "last7",
  "last7days",
  "last30",
  "last30days",
  "thisMonth",
  "all",
  "custom",
]);

const VALID_SORT_KEYS: Set<string> = new Set(["time", "name", "budget", "bhk"]);
const VALID_VIEWS: Set<string> = new Set(["all", "new", "needs_review"]);

export function parseLeadsUrlParams(
  searchParams: URLSearchParams | { get: (name: string) => string | null }
): LeadsFilterParams {
  const searchRaw = searchParams.get("search") ?? "";
  const sourceRaw = searchParams.get("source") ?? "all";
  const campaignRaw = searchParams.get("campaign") ?? "all";
  const adGroupRaw = searchParams.get("adGroup") ?? "all";
  const budgetRaw = searchParams.get("budget") ?? "all";
  const bhkRaw = searchParams.get("bhk") ?? "all";
  const planningRaw = searchParams.get("planning") ?? "all";
  const dateRaw = searchParams.get("date") ?? "today";
  const fromRaw = searchParams.get("from") ?? "";
  const toRaw = searchParams.get("to") ?? "";
  const viewRaw = searchParams.get("view") ?? "all";
  const sortRaw = searchParams.get("sort") ?? "time";
  const dirRaw = searchParams.get("dir") ?? "desc";

  // Validate and normalize date preset
  let datePreset: DatePreset = "today";
  if (VALID_DATE_PRESETS.has(dateRaw)) {
    if (dateRaw === "last7") datePreset = "last7days";
    else if (dateRaw === "last30") datePreset = "last30days";
    else datePreset = dateRaw as DatePreset;
  }

  // Validate source
  const source: LeadSource | "all" = VALID_SOURCES.has(sourceRaw)
    ? (sourceRaw as LeadSource | "all")
    : "all";

  // Validate view
  const view: ViewMode = VALID_VIEWS.has(viewRaw)
    ? (viewRaw as ViewMode)
    : "all";

  // Validate sortKey
  const sortKey: SortKey = VALID_SORT_KEYS.has(sortRaw)
    ? (sortRaw as SortKey)
    : "time";

  // Validate sortDir
  const sortDir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";

  return {
    search: searchRaw.trim(),
    source,
    campaign: campaignRaw.trim() || "all",
    adGroup: adGroupRaw.trim() || "all",
    budget: budgetRaw.trim() || "all",
    bhk: bhkRaw.trim() || "all",
    planning: planningRaw.trim() || "all",
    datePreset,
    customFrom: fromRaw.trim(),
    customTo: toRaw.trim(),
    view,
    sortKey,
    sortDir,
  };
}

export function buildLeadsUrlQuery(filters: LeadsFilterParams): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.datePreset !== "today") {
    params.set("date", filters.datePreset);
  }

  if (filters.datePreset === "custom") {
    if (filters.customFrom) params.set("from", filters.customFrom);
    if (filters.customTo) params.set("to", filters.customTo);
  }

  if (filters.source !== "all") {
    params.set("source", filters.source);
  }

  if (filters.campaign !== "all" && filters.campaign) {
    params.set("campaign", filters.campaign);
  }

  if (filters.adGroup !== "all" && filters.adGroup) {
    params.set("adGroup", filters.adGroup);
  }

  if (filters.budget !== "all" && filters.budget) {
    params.set("budget", filters.budget);
  }

  if (filters.bhk !== "all" && filters.bhk) {
    params.set("bhk", filters.bhk);
  }

  if (filters.planning !== "all" && filters.planning) {
    params.set("planning", filters.planning);
  }

  if (filters.view !== "all") {
    params.set("view", filters.view);
  }

  if (filters.sortKey !== "time") {
    params.set("sort", filters.sortKey);
  }

  if (filters.sortDir !== "desc") {
    params.set("dir", filters.sortDir);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

