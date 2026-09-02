"use client";

import { useMemo, useState, useTransition } from "react";
import type { Lead, LeadSource } from "@/lib/leads/types";
import { formatIST, istDaysAgoStartUtc } from "@/lib/time";
import { matchesSearch } from "@/lib/leads/search";
import { setLeadViewed } from "./actions";

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";
type SortKey = "time" | "name" | "budget" | "bhk";
type ViewMode = "all" | "new";

const DASH = "—";

function displayOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : DASH;
}

function truncate(value: string, max = 38): { display: string; full: string } {
  if (value.length <= max) return { display: value, full: value };
  return { display: `${value.slice(0, max - 1)}…`, full: value };
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v && v.trim()) set.add(v.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function matchesDatePreset(iso: string, preset: DatePreset, customFrom?: string, customTo?: string): boolean {
  if (preset === "all") return true;

  const submittedMs = new Date(iso).getTime();

  if (preset === "custom") {
    if (!customFrom && !customTo) return true;
    const fromMs = customFrom ? new Date(`${customFrom}T00:00:00+05:30`).getTime() : -Infinity;
    const toMs = customTo ? new Date(`${customTo}T23:59:59.999+05:30`).getTime() : Infinity;
    return submittedMs >= fromMs && submittedMs <= toMs;
  }

  const todayStart = new Date(istDaysAgoStartUtc(0)).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case "today":
      return submittedMs >= todayStart;
    case "yesterday":
      return submittedMs >= todayStart - oneDayMs && submittedMs < todayStart;
    case "last7":
      return submittedMs >= todayStart - 7 * oneDayMs;
    case "last30":
      return submittedMs >= todayStart - 30 * oneDayMs;
    default:
      return true;
  }
}

export function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [campaign, setCampaign] = useState<string>("all");
  const [adGroup, setAdGroup] = useState<string>("all");
  const [budget, setBudget] = useState<string>("all");
  const [bhk, setBhk] = useState<string>("all");
  const [planning, setPlanning] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [view, setView] = useState<ViewMode>("all");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [, startTransition] = useTransition();

  const campaignOptions = useMemo(() => uniqueSorted(leads.map((l) => l.campaign_name)), [leads]);
  const adGroupOptions = useMemo(() => uniqueSorted(leads.map((l) => l.ad_group_name)), [leads]);
  const budgetOptions = useMemo(() => uniqueSorted(leads.map((l) => l.budget_range)), [leads]);
  const bhkOptions = useMemo(() => uniqueSorted(leads.map((l) => l.bhk_configuration)), [leads]);
  const planningOptions = useMemo(() => uniqueSorted(leads.map((l) => l.planning_timeline)), [leads]);

  const filtered = useMemo(() => {
    let result = leads.filter((lead) => {
      if (view === "new" && lead.viewed_at) return false;
      if (source !== "all" && lead.source !== source) return false;
      if (campaign !== "all" && lead.campaign_name !== campaign) return false;
      if (adGroup !== "all" && lead.ad_group_name !== adGroup) return false;
      if (budget !== "all" && lead.budget_range !== budget) return false;
      if (bhk !== "all" && lead.bhk_configuration !== bhk) return false;
      if (planning !== "all" && lead.planning_timeline !== planning) return false;
      if (!matchesDatePreset(lead.source_submitted_at, datePreset, customFrom, customTo)) return false;
      if (!matchesSearch(lead, search)) return false;

      return true;
    });

    result = result.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "time":
          cmp = new Date(a.source_submitted_at).getTime() - new Date(b.source_submitted_at).getTime();
          break;
        case "name":
          cmp = (a.full_name ?? "").localeCompare(b.full_name ?? "");
          break;
        case "budget":
          cmp = (a.budget_range ?? "").localeCompare(b.budget_range ?? "");
          break;
        case "bhk":
          cmp = (a.bhk_configuration ?? "").localeCompare(b.bhk_configuration ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [leads, search, source, campaign, adGroup, budget, bhk, planning, datePreset, customFrom, customTo, sortKey, sortDir, view]);

  const newCount = filtered.filter((l) => !l.viewed_at).length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "time" ? "desc" : "asc");
    }
  }

  function handleToggleViewed(lead: Lead) {
    const nextViewed = !lead.viewed_at;
    // Optimistic update.
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, viewed_at: nextViewed ? new Date().toISOString() : null } : l)),
    );
    startTransition(async () => {
      const { error } = await setLeadViewed(lead.id, nextViewed);
      if (error) {
        // Revert on failure.
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      }
    });
  }

  return (
    <div className="space-y-4">
      <FiltersBar
        search={search}
        onSearch={setSearch}
        source={source}
        onSource={setSource}
        campaign={campaign}
        onCampaign={setCampaign}
        campaignOptions={campaignOptions}
        adGroup={adGroup}
        onAdGroup={setAdGroup}
        adGroupOptions={adGroupOptions}
        budget={budget}
        onBudget={setBudget}
        budgetOptions={budgetOptions}
        bhk={bhk}
        onBhk={setBhk}
        bhkOptions={bhkOptions}
        planning={planning}
        onPlanning={setPlanning}
        planningOptions={planningOptions}
        datePreset={datePreset}
        onDatePreset={setDatePreset}
        customFrom={customFrom}
        onCustomFrom={setCustomFrom}
        customTo={customTo}
        onCustomTo={setCustomTo}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
            <button
              onClick={() => setView("all")}
              className={`px-3 py-1.5 ${view === "all" ? "bg-accent text-white" : "bg-panel text-ink hover:bg-canvas"}`}
            >
              All
            </button>
            <button
              onClick={() => setView("new")}
              className={`px-3 py-1.5 border-l border-line ${view === "new" ? "bg-accent text-white" : "bg-panel text-ink hover:bg-canvas"}`}
            >
              New
            </button>
          </div>
          <p className="text-xs text-subtle">
            {filtered.length} lead{filtered.length === 1 ? "" : "s"}
            {newCount > 0 && <> · {newCount} new</>}
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState title="No leads yet." subtitle="Waiting for submissions…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No leads match your search or filters." />
      ) : (
        <LeadsTable leads={filtered} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} onToggleViewed={handleToggleViewed} />
      )}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border border-line rounded-lg bg-panel py-16 text-center">
      <p className="text-sm text-ink">{title}</p>
      {subtitle && <p className="text-xs text-subtle mt-1">{subtitle}</p>}
    </div>
  );
}

function LeadsTable({
  leads,
  sortKey,
  sortDir,
  onSort,
  onToggleViewed,
}: {
  leads: Lead[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onToggleViewed: (lead: Lead) => void;
}) {
  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-0.5 text-subtle">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="border border-line rounded-lg bg-panel overflow-x-auto">
      <table className="w-full text-sm min-w-[1100px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <Th onClick={() => onSort("time")}>Time{sortIndicator("time")}</Th>
            <Th>Campaign</Th>
            <Th>Ad Group</Th>
            <Th onClick={() => onSort("name")}>Name{sortIndicator("name")}</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th onClick={() => onSort("budget")}>Budget{sortIndicator("budget")}</Th>
            <Th onClick={() => onSort("bhk")}>BHK{sortIndicator("bhk")}</Th>
            <Th>Planning</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const campaign = truncate(displayOrDash(lead.campaign_name));
            const adGroup = truncate(displayOrDash(lead.ad_group_name));
            const isNew = !lead.viewed_at;
            return (
              <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                <Td>
                  <div className="flex items-center gap-1.5">
                    {isNew && <span className="inline-block w-1.5 h-1.5 rounded-full bg-new" aria-hidden />}
                    <span className={isNew ? "font-medium text-ink" : "text-subtle"}>
                      {formatIST(lead.source_submitted_at)}
                    </span>
                  </div>
                </Td>
                <Td title={campaign.full}>{campaign.display}</Td>
                <Td title={adGroup.full}>{adGroup.display}</Td>
                <Td>{displayOrDash(lead.full_name)}</Td>
                <Td>
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-accent hover:underline">
                      {lead.email}
                    </a>
                  ) : (
                    DASH
                  )}
                </Td>
                <Td>
                  {lead.phone_number ? (
                    <a href={`tel:${lead.phone_number}`} className="text-accent hover:underline">
                      {lead.phone_number}
                    </a>
                  ) : (
                    DASH
                  )}
                </Td>
                <Td>{displayOrDash(lead.budget_range)}</Td>
                <Td>{displayOrDash(lead.bhk_configuration)}</Td>
                <Td>{displayOrDash(lead.planning_timeline)}</Td>
                <Td>
                  <button
                    onClick={() => onToggleViewed(lead)}
                    className="text-xs border border-line rounded px-2 py-1 hover:bg-canvas text-ink whitespace-nowrap"
                  >
                    {isNew ? "Mark viewed" : "Mark unread"}
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap ${onClick ? "cursor-pointer select-none" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function Td({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <td className="px-3 py-2 align-middle text-ink whitespace-nowrap" title={title}>
      {children}
    </td>
  );
}

function FiltersBar(props: {
  search: string;
  onSearch: (v: string) => void;
  source: LeadSource | "all";
  onSource: (v: LeadSource | "all") => void;
  campaign: string;
  onCampaign: (v: string) => void;
  campaignOptions: string[];
  adGroup: string;
  onAdGroup: (v: string) => void;
  adGroupOptions: string[];
  budget: string;
  onBudget: (v: string) => void;
  budgetOptions: string[];
  bhk: string;
  onBhk: (v: string) => void;
  bhkOptions: string[];
  planning: string;
  onPlanning: (v: string) => void;
  planningOptions: string[];
  datePreset: DatePreset;
  onDatePreset: (v: DatePreset) => void;
  customFrom: string;
  onCustomFrom: (v: string) => void;
  customTo: string;
  onCustomTo: (v: string) => void;
}) {
  const selectClass =
    "text-xs border border-line rounded-md px-2 py-1.5 bg-panel text-ink outline-none focus:border-accent";

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={props.search}
        onChange={(e) => props.onSearch(e.target.value)}
        placeholder="Search name, phone, email, campaign, budget, BHK, planning…"
        className="w-full rounded-md border border-line px-3 py-2 text-sm bg-panel text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      <div className="flex flex-wrap gap-2">
        <select className={selectClass} value={props.source} onChange={(e) => props.onSource(e.target.value as LeadSource | "all")}>
          <option value="all">All sources</option>
          <option value="google_ads">Google Ads</option>
          <option value="meta_ads">Meta Ads</option>
        </select>

        <OptionSelect label="All campaigns" value={props.campaign} onChange={props.onCampaign} options={props.campaignOptions} className={selectClass} />
        <OptionSelect label="All ad groups" value={props.adGroup} onChange={props.onAdGroup} options={props.adGroupOptions} className={selectClass} />
        <OptionSelect label="All budgets" value={props.budget} onChange={props.onBudget} options={props.budgetOptions} className={selectClass} />
        <OptionSelect label="All BHK" value={props.bhk} onChange={props.onBhk} options={props.bhkOptions} className={selectClass} />
        <OptionSelect label="All planning" value={props.planning} onChange={props.onPlanning} options={props.planningOptions} className={selectClass} />

        <select
          className={selectClass}
          value={props.datePreset}
          onChange={(e) => props.onDatePreset(e.target.value as DatePreset)}
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="custom">Custom range</option>
        </select>

        {props.datePreset === "custom" && (
          <>
            <input
              type="date"
              className={selectClass}
              value={props.customFrom}
              onChange={(e) => props.onCustomFrom(e.target.value)}
            />
            <span className="text-xs text-subtle self-center">to</span>
            <input
              type="date"
              className={selectClass}
              value={props.customTo}
              onChange={(e) => props.onCustomTo(e.target.value)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className: string;
}) {
  if (options.length === 0) return null;
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {truncate(opt, 40).display}
        </option>
      ))}
    </select>
  );
}
