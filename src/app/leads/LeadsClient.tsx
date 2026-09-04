"use client";

import { useMemo, useState, useTransition } from "react";
import type { Lead, LeadSource } from "@/lib/leads/types";
import { formatIST, istDaysAgoStartUtc } from "@/lib/time";
import { matchesSearch } from "@/lib/leads/search";
import { formatCampaignName } from "@/lib/leads/formatters";
import { setLeadViewed } from "./actions";
import { SourceBadge } from "./SourceBadge";
import { PhoneCell } from "./PhoneCell";
import { LeadDetailDrawer } from "./LeadDetailDrawer";

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
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

  const totalCount = filtered.length;
  const newCount = filtered.filter((l) => !l.viewed_at).length;
  const viewedCount = totalCount - newCount;
  const googleCount = filtered.filter((l) => l.source === "google_ads").length;
  const metaCount = filtered.filter((l) => l.source === "meta_ads").length;
  const acresCount = filtered.filter((l) => l.source === "99acres").length;
  const mbCount = filtered.filter((l) => l.source === "magicbricks").length;

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
    const nextTimestamp = nextViewed ? new Date().toISOString() : null;

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, viewed_at: nextTimestamp } : l)),
    );
    setSelectedLead((prev) =>
      prev && prev.id === lead.id ? { ...prev, viewed_at: nextTimestamp } : prev,
    );

    startTransition(async () => {
      const { error } = await setLeadViewed(lead.id, nextViewed);
      if (error) {
        // Revert on failure
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
        setSelectedLead((prev) => (prev && prev.id === lead.id ? lead : prev));
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
        datePreset={datePreset}
        onDatePreset={setDatePreset}
        customFrom={customFrom}
        onCustomFrom={setCustomFrom}
        customTo={customTo}
        onCustomTo={setCustomTo}
      />

      {/* Segments & Top Right Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setView("all"); setSource("all"); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              view === "all" && source === "all"
                ? "bg-accent text-white border-accent"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            All Leads
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${view === "all" && source === "all" ? "bg-white/20" : "bg-canvas border border-line"}`}>{totalCount}</span>
          </button>
          
          <button
            onClick={() => setView(view === "new" ? "all" : "new")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              view === "new"
                ? "bg-accent-soft text-accent border-accent/40"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            New
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${view === "new" ? "bg-white/60" : "bg-canvas border border-line"}`}>{newCount}</span>
          </button>

          <div className="w-px h-5 bg-line mx-1" />

          <button
            onClick={() => setSource("all")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              source === "all"
                ? "bg-accent-soft text-accent border-accent/40"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            All Sources
          </button>
          
          <button
            onClick={() => setSource(source === "google_ads" ? "all" : "google_ads")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              source === "google_ads"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.825-.07-1.635-.205-2.415H12v4.545h6.63c-.285 1.485-1.11 2.745-2.355 3.585v2.955h3.795c2.22-2.055 3.51-5.07 3.51-8.67Z"/><path fill="#34A853" d="M12 24c3.24 0 5.955-1.08 7.935-2.91l-3.795-2.955c-1.08.735-2.46 1.155-4.14 1.155-3.18 0-5.88-2.145-6.84-5.025H1.245v3.06C3.21 21.36 7.29 24 12 24Z"/><path fill="#FBBC05" d="M5.16 15.265c-.24-.735-.375-1.53-.375-2.355 0-.825.135-1.62.375-2.355v-3.06H1.245A11.967 11.967 0 0 0 0 12.91c0 1.935.465 3.765 1.245 5.415l3.915-3.06Z"/><path fill="#EA4335" d="M12 4.71c1.755 0 3.345.6 4.59 1.785l3.435-3.435C17.94 1.155 15.225 0 12 0 7.29 0 3.21 2.64 1.245 6.495l3.915 3.06c.96-2.88 3.66-5.025 6.84-5.025Z"/></svg>
            Google Ads
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${source === "google_ads" ? "bg-white/60" : "bg-canvas border border-line"}`}>{googleCount}</span>
          </button>
          
          <button
            onClick={() => setSource(source === "meta_ads" ? "all" : "meta_ads")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              source === "meta_ads"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Meta / Facebook
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${source === "meta_ads" ? "bg-white/60" : "bg-canvas border border-line"}`}>{metaCount}</span>
          </button>

          <button
            onClick={() => setSource(source === "99acres" ? "all" : "99acres")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              source === "99acres"
                ? "bg-teal-50 text-teal-800 border-teal-200"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <span className="text-teal-600 font-extrabold text-[10px]">99</span>
            99acres
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${source === "99acres" ? "bg-white/60" : "bg-canvas border border-line"}`}>{acresCount}</span>
          </button>

          <button
            onClick={() => setSource(source === "magicbricks" ? "all" : "magicbricks")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border shadow-2xs ${
              source === "magicbricks"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-panel text-ink hover:bg-canvas border-line"
            }`}
          >
            <span className="bg-red-600 text-white rounded-[2px] text-[8px] px-0.5 font-bold">mb</span>
            MagicBricks
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${source === "magicbricks" ? "bg-white/60" : "bg-canvas border border-line"}`}>{mbCount}</span>
          </button>
        </div>

        <p className="text-[11px] text-subtle hidden md:block">
          💡 Click any row to view full details
        </p>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-1">
        <div className="bg-panel border border-line rounded-lg p-4 flex items-center gap-4 shadow-2xs">
          <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </div>
          <div>
            <div className="text-xl font-bold text-ink">{totalCount}</div>
            <div className="text-xs text-subtle font-medium mt-0.5">Total Leads</div>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-lg p-4 flex items-center gap-4 shadow-2xs">
          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          </div>
          <div>
            <div className="text-xl font-bold text-ink">{newCount}</div>
            <div className="text-xs text-subtle font-medium mt-0.5">New Leads</div>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-lg p-4 flex items-center gap-4 shadow-2xs">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </div>
          <div>
            <div className="text-xl font-bold text-ink">{viewedCount}</div>
            <div className="text-xs text-subtle font-medium mt-0.5">Viewed Leads</div>
          </div>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState title="No leads yet." subtitle="Waiting for submissions…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No leads match your search or filters." />
      ) : (
        <LeadsTable
          leads={filtered}
          selectedLeadId={selectedLead?.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelectLead={setSelectedLead}
          onToggleViewed={handleToggleViewed}
        />
      )}

      {/* Slide-over Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onToggleViewed={handleToggleViewed}
      />
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border border-line rounded-lg bg-panel py-16 text-center shadow-xs">
      <p className="text-sm font-medium text-ink">{title}</p>
      {subtitle && <p className="text-xs text-subtle mt-1">{subtitle}</p>}
    </div>
  );
}

function LeadsTable({
  leads,
  selectedLeadId,
  sortKey,
  sortDir,
  onSort,
  onSelectLead,
  onToggleViewed,
}: {
  leads: Lead[];
  selectedLeadId?: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelectLead: (lead: Lead) => void;
  onToggleViewed: (lead: Lead) => void;
}) {
  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-0.5 text-subtle">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="border border-line rounded-lg bg-panel overflow-auto max-h-[calc(100vh-230px)] shadow-xs relative">
      <table className="w-full text-sm min-w-[1100px] border-collapse">
        <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
          <tr className="text-left text-xs text-subtle bg-white">
            <Th className="w-[40px] px-4"><input type="checkbox" className="rounded border-line accent-accent" /></Th>
            <Th onClick={() => onSort("time")}>Date & Time{sortIndicator("time")}</Th>
            <Th>Source</Th>
            <Th onClick={() => onSort("name")}>Name{sortIndicator("name")}</Th>
            <Th className="min-w-[175px]">Phone & Actions</Th>
            <Th>Campaign</Th>
            <Th>Ad Group</Th>
            <Th>Status</Th>
            <Th className="w-[40px]"></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {leads.map((lead) => {
            const campaign = formatCampaignName(lead.campaign_name);
            const adGroup = truncate(displayOrDash(lead.ad_group_name), 28);
            const isNew = !lead.viewed_at;
            const isSelected = selectedLeadId === lead.id;

            return (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className={`transition-colors cursor-pointer select-none ${
                  isSelected
                    ? "bg-accent-soft/60 hover:bg-accent-soft/80"
                    : "hover:bg-canvas/80 bg-panel"
                }`}
              >
                {/* Checkbox */}
                <Td className="w-[40px] px-4" onClick={(e: any) => e.stopPropagation()}>
                  <input type="checkbox" className="rounded border-line accent-accent cursor-pointer" />
                </Td>
                
                {/* Date & Time */}
                <Td>
                  <div className="flex items-center gap-2">
                    {isNew && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                        title="New unread lead"
                        aria-hidden
                      />
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ink">
                        {new Date(lead.source_submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ','}
                      </span>
                      <span className="text-xs text-subtle">
                        {new Date(lead.source_submitted_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                      </span>
                    </div>
                  </div>
                </Td>

                {/* Source Badge */}
                <Td>
                  <SourceBadge source={lead.source} platform={lead.platform} />
                </Td>

                {/* Name & Email */}
                <Td>
                  <div className="flex flex-col">
                    <span className="font-bold text-ink inline-flex items-center gap-1.5">
                      {displayOrDash(lead.full_name)}
                      {lead.full_name && (
                        <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                      )}
                    </span>
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-subtle hover:text-accent hover:underline truncate max-w-[160px]"
                        title={lead.email}
                      >
                        {lead.email}
                      </a>
                    )}
                  </div>
                </Td>

                {/* Phone & Actions */}
                <Td className="min-w-[175px]">
                  <PhoneCell
                    phone={lead.phone_number}
                    fullName={lead.full_name}
                    campaignName={lead.campaign_name}
                  />
                </Td>

                {/* Campaign */}
                <Td title={lead.campaign_name || undefined}>
                  <div className="flex flex-col gap-1 max-w-[200px]">
                    <span className="font-medium text-ink truncate">
                      {campaign.title}
                    </span>
                    {campaign.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {campaign.badges.map((b) => (
                          <span
                            key={b}
                            className="text-[10px] px-1.5 py-0.2 bg-canvas text-subtle rounded border border-line font-medium"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Td>

                {/* Ad Group */}
                <Td title={adGroup.full}>
                  <span className="text-subtle text-xs">{adGroup.display}</span>
                </Td>

                {/* Status */}
                <Td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleViewed(lead);
                    }}
                    className={`text-xs border rounded px-2.5 py-1 transition-colors whitespace-nowrap font-medium shadow-2xs ${
                      isNew
                        ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent hover:text-white"
                        : "border-line bg-panel hover:bg-canvas text-subtle hover:text-ink"
                    }`}
                  >
                    {isNew ? "Mark viewed" : "Mark unread"}
                  </button>
                </Td>

                {/* Menu */}
                <Td className="w-[40px] px-2 text-right">
                  <button className="p-1.5 text-subtle hover:bg-canvas rounded transition-colors" onClick={(e) => e.stopPropagation()}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
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

function Th({ children, onClick, className = "" }: { children?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 font-medium border-b border-line whitespace-nowrap ${
        onClick ? "cursor-pointer hover:bg-canvas/50" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-1.5">{children}</div>
    </th>
  );
}

function Td({ children, title, className = "", onClick }: { children: React.ReactNode; title?: string; className?: string; onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void }) {
  return (
    <td className={`px-3 py-2.5 align-middle text-ink whitespace-nowrap ${className}`} title={title} onClick={onClick}>
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
  datePreset: DatePreset;
  onDatePreset: (v: DatePreset) => void;
  customFrom: string;
  onCustomFrom: (v: string) => void;
  customTo: string;
  onCustomTo: (v: string) => void;
}) {
  const selectClass =
    "text-sm font-medium border border-line rounded-md px-3 py-2 bg-panel text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent shadow-2xs appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg fill=\"none\" stroke=\"%236b7280\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M19 9l-7 7-7-7\"></path></svg>')] bg-no-repeat bg-[position:right_0.75rem_center] bg-[length:1em_1em]";

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          placeholder="Search name, phone, email, campaign, budget, BHK, planning..."
          className="w-full rounded-lg border border-line pl-11 pr-12 py-3 text-sm bg-panel text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent shadow-2xs placeholder:text-subtle/70 font-medium"
        />
        <svg
          className="w-5 h-5 text-subtle absolute left-4 top-3.5 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <div className="absolute right-4 top-3.5 text-[11px] font-medium text-subtle border border-line rounded px-1.5 py-0.5 bg-canvas pointer-events-none">
          ⌘ K
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={selectClass}
            value={props.source}
            onChange={(e) => props.onSource(e.target.value as LeadSource | "all")}
          >
            <option value="all">All sources</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="99acres">99acres</option>
            <option value="magicbricks">MagicBricks</option>
          </select>

          <OptionSelect
            label="All campaigns"
            value={props.campaign}
            onChange={props.onCampaign}
            options={props.campaignOptions}
            className={selectClass}
          />
          <OptionSelect
            label="All ad groups"
            value={props.adGroup}
            onChange={props.onAdGroup}
            options={props.adGroupOptions}
            className={selectClass}
          />
          
          <div className="flex items-center gap-2">
            <div className="relative inline-block">
              <svg className="w-4 h-4 text-subtle absolute left-3 top-2.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <select
                className={`${selectClass} pl-9`}
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
            </div>
          </div>

          {props.datePreset === "custom" && (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="date"
                className={selectClass}
                value={props.customFrom}
                onChange={(e) => props.onCustomFrom(e.target.value)}
              />
              <span className="text-xs text-subtle">to</span>
              <input
                type="date"
                className={selectClass}
                value={props.customTo}
                onChange={(e) => props.onCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-sm font-medium text-ink underline underline-offset-2 decoration-subtle/40 hover:decoration-ink"
            onClick={() => {
              props.onSearch("");
              props.onSource("all");
              props.onCampaign("all");
              props.onAdGroup("all");
              props.onDatePreset("all");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-accent hover:bg-[#1a3d33] text-white text-sm font-medium rounded-lg shadow-2xs transition-colors"
          >
            Apply Filters
          </button>
        </div>
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
