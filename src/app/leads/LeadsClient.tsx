"use client";

import { useEffect, useRef, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import type { Lead, LeadSource } from "@/lib/leads/types";
import { formatIST, istDaysAgoStartUtc, getIstBusinessDayWindow, formatLeadDateTime } from "@/lib/time";
import { matchesSearch } from "@/lib/leads/search";

import { formatCampaignName } from "@/lib/leads/formatters";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { setLeadViewed } from "./actions";
import { SourceBadge } from "./SourceBadge";
import { PhoneCell } from "./PhoneCell";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { getSalesTeam, assignLead, type SalesRep } from "./assignment-actions";
import { exportLeadsToCsv } from "@/lib/leads/export-csv";
import { UnseenYesterdaySection } from "./UnseenYesterdaySection";
import {
  parseLeadsUrlParams,
  buildLeadsUrlQuery,
  type DatePreset,
  type SortKey,
  type ViewMode,
} from "@/lib/leads/filters-url";
import { showLeadDesktopNotification } from "@/lib/notifications/desktop";
import { NotificationPermissionButton } from "@/components/leads/NotificationPermissionButton";


type ColumnKey = "time" | "source" | "name" | "phone" | "campaign" | "status";

const DEFAULT_COL_WIDTHS: Record<ColumnKey, number> = {
  time: 160,
  source: 125,
  name: 185,
  phone: 190,
  campaign: 260,
  status: 125,
};

const MIN_COL_WIDTHS: Record<ColumnKey, number> = {
  time: 110,
  source: 90,
  name: 120,
  phone: 160,
  campaign: 160,
  status: 100,
};



const DASH = "—";

function getDatePresetLabel(preset: DatePreset, customFrom?: string, customTo?: string): string {
  switch (preset) {
    case "today":
      return "(Today)";
    case "yesterday":
      return "(Yesterday)";
    case "last7":
    case "last7days":
      return "(Last 7 Days)";
    case "last30":
    case "last30days":
      return "(Last 30 Days)";
    case "thisMonth":
      return "(This Month)";
    case "all":
      return "(All Time)";
    case "custom":
      return customFrom && customTo ? `(${customFrom} to ${customTo})` : "(Custom)";
    default:
      return "";
  }
}

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

  const { startMs: todayStart, endMs: todayEnd } = getIstBusinessDayWindow();
  const oneDayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case "today":
      return submittedMs >= todayStart && submittedMs <= todayEnd;
    case "yesterday":
      return submittedMs >= todayStart - oneDayMs && submittedMs < todayStart;
    case "last7":
    case "last7days":
      return submittedMs >= todayStart - 7 * oneDayMs;
    case "last30":
    case "last30days":
      return submittedMs >= todayStart - 30 * oneDayMs;
    case "thisMonth": {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(Date.now() + IST_OFFSET_MS);
      const monthStartMs = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), 1, 0, 0, 0) - IST_OFFSET_MS;
      return submittedMs >= monthStartMs;
    }
    default:
      return true;
  }
}
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1);
  } catch (e) {
    // Ignore if audio context fails
  }
}

interface LeadToast {
  id: string;
  lead?: Lead;
  message?: string;
}

export function LeadsClient({
  initialLeads,
  initialUnseenYesterdayLeads = [],
  kpiCounts,
  totalCount: initialTotalCount,
  userRole = "staff",
}: {
  initialLeads: Lead[];
  initialUnseenYesterdayLeads?: Lead[];
  kpiCounts: any;
  totalCount: number;
  userRole?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [unseenYesterdayLeads, setUnseenYesterdayLeads] = useState<Lead[]>(initialUnseenYesterdayLeads);
  const leadsRef = useRef<Lead[]>(initialLeads);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<LeadToast[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesRep[]>([]);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState<boolean>(false);

  useEffect(() => {
    setUnseenYesterdayLeads(initialUnseenYesterdayLeads);
  }, [initialUnseenYesterdayLeads]);

  useEffect(() => {
    getSalesTeam().then(({ data }) => {
      if (data) setSalesTeam(data);
    });
  }, []);


  // Background fetch remaining leads to support client-side filtering without hitting worker limits
  useEffect(() => {
    let isMounted = true;
    async function fetchRemaining() {
      const targetTotal = initialTotalCount || kpiCounts?.total || kpiCounts?.total_count || 0;
      if (leadsRef.current.length >= targetTotal) return;
      let currentLength = leadsRef.current.length;
      try {
        while (currentLength < targetTotal && isMounted) {
          const { data, error } = await supabase
            .from("leads")
            .select("id, external_lead_id, full_name, phone_number, email, campaign_name, ad_group_name, ad_name, budget_range, bhk_configuration, planning_timeline, source, source_submitted_at, viewed_at, raw_payload, assigned_to, assigned_at, lead_status, disposition, disposition_details, next_follow_up, lead_stage, token_amount, closed_at, needs_staff_review, platform")
            .order("source_submitted_at", { ascending: false })
            .range(currentLength, currentLength + 499);
            
          if (error || !data || data.length === 0) break;
          
          setLeads((prev) => {
            const combined = [...prev, ...(data as Lead[])];
            const unique = combined.filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);
            return unique.sort(
              (a, b) => new Date(b.source_submitted_at).getTime() - new Date(a.source_submitted_at).getTime()
            );
          });
          currentLength += data.length;
        }
      } finally {
        if (isMounted) {
          setIsBackgroundFetching(false);
        }
      }
    }
    fetchRemaining();
    return () => {
      isMounted = false;
      setIsBackgroundFetching(false);
    };
  }, [initialTotalCount, kpiCounts, supabase]);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    const channel = supabase
      .channel("realtime-leads")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const newLead = payload.new as Lead;

          setLeads((prev) => {
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return [newLead, ...prev].sort(
              (a, b) => new Date(b.source_submitted_at).getTime() - new Date(a.source_submitted_at).getTime()
            );
          });

          setHighlightedRows((prev) => new Set(prev).add(newLead.id));
          setTimeout(() => {
            setHighlightedRows((prev) => {
              const next = new Set(prev);
              next.delete(newLead.id);
              return next;
            });
          }, 3000);

          const toastId = `${newLead.id}-${Date.now()}`;
          setToasts((prev) => [{ id: toastId, lead: newLead }, ...prev].slice(0, 3)); // Keep max 3 stacked

          // Auto-dismiss after 6 seconds
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
          }, 6000);

          playChime();

          // Native Windows/browser desktop notification when CRM tab is in background
          showLeadDesktopNotification(newLead, {
            onClick: () => {
              setSelectedLead(newLead);
            },
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const updatedLead = payload.new as Lead;
          setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? { ...l, viewed_at: updatedLead.viewed_at } : l)));
          if (updatedLead.viewed_at) {
            setUnseenYesterdayLeads((prev) => prev.filter((l) => l.id !== updatedLead.id));
          }
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const handleFocus = async () => {
      if (!leadsRef.current.length) return;
      const maxCreated = leadsRef.current.reduce(
        (max, l) => (new Date(l.source_submitted_at) > new Date(max) ? l.source_submitted_at : max),
        leadsRef.current[0]!.source_submitted_at
      );

      const { data } = await supabase
        .from("leads")
        .select("id, external_lead_id, full_name, phone_number, email, campaign_name, ad_group_name, ad_name, budget_range, bhk_configuration, planning_timeline, source, source_submitted_at, viewed_at, raw_payload, assigned_to, assigned_at, lead_status, disposition, disposition_details, next_follow_up, lead_stage, token_amount, closed_at, needs_staff_review, platform")
        .gt("source_submitted_at", maxCreated)
        .order("source_submitted_at", { ascending: false });

      if (data && data.length > 0) {
        const newLeads = data as Lead[];

        setLeads((prev) => {
          const combined = [...newLeads, ...prev];
          const unique = combined.filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);
          return unique.sort(
            (a, b) => new Date(b.source_submitted_at).getTime() - new Date(a.source_submitted_at).getTime()
          );
        });
      }
    };

    window.addEventListener("focus", handleFocus);
    const handleVis = () => {
      if (document.visibilityState === "visible") handleFocus();
    };
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [supabase]);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const initialFilterParams = useMemo(() => {
    return parseLeadsUrlParams(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(initialFilterParams.search);
  const [source, setSource] = useState<LeadSource | "all">(initialFilterParams.source);
  const [campaign, setCampaign] = useState<string>(initialFilterParams.campaign);
  const [adGroup, setAdGroup] = useState<string>(initialFilterParams.adGroup);
  const [budget, setBudget] = useState<string>(initialFilterParams.budget);
  const [bhk, setBhk] = useState<string>(initialFilterParams.bhk);
  const [planning, setPlanning] = useState<string>(initialFilterParams.planning);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialFilterParams.datePreset);
  const [customFrom, setCustomFrom] = useState(initialFilterParams.customFrom);
  const [customTo, setCustomTo] = useState(initialFilterParams.customTo);
  const [view, setView] = useState<ViewMode>(initialFilterParams.view);
  const [sortKey, setSortKey] = useState<SortKey>(initialFilterParams.sortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialFilterParams.sortDir);
  const [, startTransition] = useTransition();
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const isApplyingUrlRef = useRef(false);
  const lastSyncedQueryRef = useRef(searchParams.toString());

  // Keyboard shortcut ⌘K / Ctrl+K to focus search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Browser Back / Forward sync
  useEffect(() => {
    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const fromUrl = parseLeadsUrlParams(currentParams);
      isApplyingUrlRef.current = true;
      setSearch(fromUrl.search);
      setSource(fromUrl.source);
      setCampaign(fromUrl.campaign);
      setAdGroup(fromUrl.adGroup);
      setBudget(fromUrl.budget);
      setBhk(fromUrl.bhk);
      setPlanning(fromUrl.planning);
      setDatePreset(fromUrl.datePreset);
      setCustomFrom(fromUrl.customFrom);
      setCustomTo(fromUrl.customTo);
      setView(fromUrl.view);
      setSortKey(fromUrl.sortKey);
      setSortDir(fromUrl.sortDir);
      lastSyncedQueryRef.current = window.location.search.replace(/^\?/, "");

      setTimeout(() => {
        isApplyingUrlRef.current = false;
      }, 50);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Update URL query parameters on filter changes (debounced for search)
  useEffect(() => {
    if (isApplyingUrlRef.current) return;

    const handler = setTimeout(() => {
      const newQuery = buildLeadsUrlQuery({
        search,
        source,
        campaign,
        adGroup,
        budget,
        bhk,
        planning,
        datePreset,
        customFrom,
        customTo,
        view,
        sortKey,
        sortDir,
      });

      const normalizedQuery = newQuery.startsWith("?") ? newQuery.slice(1) : newQuery;
      if (normalizedQuery !== lastSyncedQueryRef.current) {
        lastSyncedQueryRef.current = normalizedQuery;
        const nextUrl = newQuery ? `${pathname}${newQuery}` : pathname;
        window.history.replaceState(null, "", nextUrl);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [
    search,
    source,
    campaign,
    adGroup,
    budget,
    bhk,
    planning,
    datePreset,
    customFrom,
    customTo,
    view,
    sortKey,
    sortDir,
    pathname,
  ]);

  const handleResetFilters = () => {
    isApplyingUrlRef.current = true;
    setSearch("");
    setSource("all");
    setCampaign("all");
    setAdGroup("all");
    setBudget("all");
    setBhk("all");
    setPlanning("all");
    setDatePreset("today");
    setCustomFrom("");
    setCustomTo("");
    setView("all");
    setSortKey("time");
    setSortDir("desc");
    lastSyncedQueryRef.current = "";
    window.history.replaceState(null, "", pathname);
    setTimeout(() => {
      isApplyingUrlRef.current = false;
    }, 50);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, source, campaign, adGroup, budget, bhk, planning, datePreset, customFrom, customTo, view, sortKey, sortDir, pageSize]);

  const availableCampaigns = useMemo(() => {
    if (source === "all") return [];
    return Array.from(
      new Set(
        leads
          .filter((l) => l.source === source && l.campaign_name)
          .map((l) => l.campaign_name!.trim())
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [leads, source]);
  const adGroupOptions = useMemo(() => uniqueSorted(leads.map((l) => l.ad_group_name)), [leads]);
  const budgetOptions = useMemo(() => uniqueSorted(leads.map((l) => l.budget_range)), [leads]);
  const bhkOptions = useMemo(() => uniqueSorted(leads.map((l) => l.bhk_configuration)), [leads]);
  const planningOptions = useMemo(() => uniqueSorted(leads.map((l) => l.planning_timeline)), [leads]);

  useEffect(() => {
    if (source === "all") {
      if (campaign !== "all") setCampaign("all");
      return;
    }
    // Protect against wiping campaign while background leads are still loading
    if (!isBackgroundFetching && availableCampaigns.length > 0 && campaign !== "all") {
      if (!availableCampaigns.includes(campaign)) {
        setCampaign("all");
      }
    }
  }, [source, campaign, availableCampaigns, isBackgroundFetching]);

  const filtered = useMemo(() => {
    const searchTerm = search.trim();

    let result = leads.filter((lead) => {
      if (searchTerm.length > 0 && !matchesSearch(lead, searchTerm)) return false;
      if (view === "new" && lead.viewed_at) return false;
      if (view === "needs_review" && !lead.needs_staff_review) return false;
      if (view === "unassigned" && lead.assigned_to) return false;
      if (view === "needs_followup" && !lead.next_follow_up) return false;
      if (source !== "all" && lead.source !== source) return false;
      if (campaign !== "all" && lead.campaign_name !== campaign) return false;
      if (adGroup !== "all" && lead.ad_group_name !== adGroup) return false;
      if (budget !== "all" && lead.budget_range !== budget) return false;
      if (bhk !== "all" && lead.bhk_configuration !== bhk) return false;
      if (planning !== "all" && lead.planning_timeline !== planning) return false;
      if (!matchesDatePreset(lead.source_submitted_at, datePreset, customFrom, customTo)) return false;

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startItem = filtered.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, filtered.length);

  const paginatedLeads = useMemo(() => {
    return filtered.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  }, [filtered, safeCurrentPage, pageSize]);

  // Real-time queue counts matching active time window and source
  const queueCounts = useMemo(() => {
    const baseInWindow = leads.filter(
      (l) =>
        (source === "all" || l.source === source) &&
        matchesDatePreset(l.source_submitted_at, datePreset, customFrom, customTo)
    );

    return {
      all: baseInWindow.length,
      new: baseInWindow.filter((l) => !l.viewed_at).length,
      needs_followup: baseInWindow.filter((l) => Boolean(l.next_follow_up)).length,
      unassigned: baseInWindow.filter((l) => !l.assigned_to).length,
      needs_review: baseInWindow.filter((l) => Boolean(l.needs_staff_review)).length,
    };
  }, [leads, source, datePreset, customFrom, customTo]);

  // Real-time source counts matching active time window and queue view
  const sourceCounts = useMemo(() => {
    const baseInWindow = leads.filter((l) => {
      if (view === "new" && l.viewed_at) return false;
      if (view === "needs_review" && !l.needs_staff_review) return false;
      if (view === "unassigned" && l.assigned_to) return false;
      if (view === "needs_followup" && !l.next_follow_up) return false;
      return matchesDatePreset(l.source_submitted_at, datePreset, customFrom, customTo);
    });

    return {
      all: baseInWindow.length,
      google_ads: baseInWindow.filter((l) => l.source === "google_ads").length,
      meta_ads: baseInWindow.filter((l) => l.source === "meta_ads").length,
      "99acres": baseInWindow.filter((l) => l.source === "99acres").length,
      magicbricks: baseInWindow.filter((l) => l.source === "magicbricks").length,
    };
  }, [leads, view, datePreset, customFrom, customTo]);

  const isFiltered =
    search.trim() !== "" ||
    source !== "all" ||
    campaign !== "all" ||
    adGroup !== "all" ||
    budget !== "all" ||
    bhk !== "all" ||
    planning !== "all" ||
    datePreset !== "today" ||
    view !== "all";

  const moreFiltersActiveCount = [
    adGroup !== "all",
    budget !== "all",
    bhk !== "all",
    planning !== "all",
  ].filter(Boolean).length;

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
    if (nextViewed) {
      setUnseenYesterdayLeads((prev) => prev.filter((l) => l.id !== lead.id));
    }

    startTransition(async () => {
      const { error } = await setLeadViewed(lead.id, nextViewed);
      if (error) {
        // Revert on failure
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
        setSelectedLead((prev) => (prev && prev.id === lead.id ? lead : prev));
        if (nextViewed) {
          setUnseenYesterdayLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
        }
      }
    });
  }

  function handleDismissToast(toastId: string) {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }

  function handleToastView(toastLead: Lead, toastId: string) {
    setSelectedLead(toastLead);
    if (!toastLead.viewed_at) {
      handleToggleViewed(toastLead);
    }
    handleDismissToast(toastId);
  }

  async function handleMarkSelectedAsViewed() {
    if (selectedIds.size === 0) return;
    const idsToUpdate = Array.from(selectedIds);
    const now = new Date().toISOString();

    setLeads((prev) =>
      prev.map((lead) =>
        selectedIds.has(lead.id) && !lead.viewed_at
          ? { ...lead, viewed_at: now }
          : lead
      )
    );
    setUnseenYesterdayLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));

    const { error } = await supabase
      .from("leads")
      .update({ viewed_at: now })
      .in("id", idsToUpdate);

    if (error) {
      console.error("Failed to mark selected leads as viewed:", error);
    }

    setSelectedIds(new Set());
  }

  async function handleRenameLead(leadId: string, fullName: string): Promise<{ error: string | null }> {
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });
      const body = (await response.json()) as { error?: string; lead?: Lead };
      if (!response.ok || !body.lead) {
        return { error: body.error || "Could not update lead." };
      }

      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, full_name: body.lead!.full_name } : l)));
      setUnseenYesterdayLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, full_name: body.lead!.full_name } : l)));
      setSelectedLead((prev) =>
        prev && prev.id === leadId ? { ...prev, full_name: body.lead!.full_name } : prev,
      );
      return { error: null };
    } catch {
      return { error: "Could not update lead." };
    }
  }

  async function handleAssignLead(leadId: string, userId: string | null): Promise<{ error: string | null }> {
    const now = new Date().toISOString();
    
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, assigned_to: userId, assigned_at: userId ? now : null, lead_status: userId ? "Assigned" : null } : l)));
    setUnseenYesterdayLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, assigned_to: userId, assigned_at: userId ? now : null, lead_status: userId ? "Assigned" : null } : l)));
    setSelectedLead((prev) => prev && prev.id === leadId ? { ...prev, assigned_to: userId, assigned_at: userId ? now : null, lead_status: userId ? "Assigned" : null } : prev);

    const rep = salesTeam.find((r) => r.id === userId);
    const toastMessage = userId
      ? `Lead assigned to ${rep?.full_name || rep?.email || "Agent"}`
      : "Lead set to Unassigned";

    const toastId = `assign-${leadId}-${Date.now()}`;
    setToasts((prev) => [{ id: toastId, message: toastMessage }, ...prev].slice(0, 3));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 4000);

    startTransition(async () => {
      const { error } = await assignLead(leadId, userId);
      if (error) {
        console.error("Assignment failed", error);
      }
    });

    return { error: null };
  }


  const [isExporting, setIsExporting] = useState(false);
  const canExport = userRole !== "sales";

  const targetTotalLeads = initialTotalCount || kpiCounts?.total || kpiCounts?.total_count || 0;
  const isFetchComplete = leads.length >= targetTotalLeads;
  const isSelectedExport = selectedIds.size > 0;

  // When exporting filtered dataset (no selection), export is disabled while background fetch is running
  const isExportDisabled =
    isExporting ||
    (!isSelectedExport && (isBackgroundFetching || filtered.length === 0));

  let exportButtonLabel = "Export CSV";
  let exportTooltip = `Export ${filtered.length} filtered leads to CSV`;

  if (isSelectedExport) {
    exportButtonLabel = `Export Selected (${selectedIds.size})`;
    exportTooltip = `Export ${selectedIds.size} selected leads to CSV`;
  } else if (isBackgroundFetching && !isFetchComplete) {
    exportButtonLabel = `Syncing (${leads.length}/${targetTotalLeads})...`;
    exportTooltip = `Loading remaining leads in background before export is ready (${leads.length} of ${targetTotalLeads} loaded)...`;
  } else if (filtered.length === 0) {
    exportButtonLabel = "Export CSV";
    exportTooltip = "No leads match current filters to export";
  } else {
    exportButtonLabel = `Export (${filtered.length})`;
    exportTooltip = `Export ${filtered.length} filtered leads to CSV`;
  }

  const handleExport = () => {
    if (isExportDisabled) return;
    try {
      setIsExporting(true);
      if (isSelectedExport) {
        const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
        exportLeadsToCsv(selectedLeads, salesTeam, "selected");
      } else {
        exportLeadsToCsv(filtered, salesTeam, datePreset);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header and Primary / Secondary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Leads</h1>
          <p className="text-xs text-subtle mt-0.5">
            Inbound enquiries, sales team assignment, and cross-channel tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <NotificationPermissionButton />

          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={isExportDisabled}
              className={`inline-flex items-center gap-1.5 border rounded-md text-xs font-semibold h-8 px-3 transition-colors shadow-2xs ${
                isExportDisabled
                  ? "bg-canvas text-subtle border-line cursor-not-allowed opacity-70"
                  : isSelectedExport
                  ? "bg-accent-soft text-accent border-accent/40 hover:bg-accent hover:text-white"
                  : "bg-panel text-ink hover:bg-slate-50 border-line"
              }`}
              title={exportTooltip}
              aria-label={exportTooltip}
            >
              {isExporting || (isBackgroundFetching && !isSelectedExport && !isFetchComplete) ? (
                <svg className="w-3.5 h-3.5 animate-spin text-subtle" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>{exportButtonLabel}</span>
            </button>
          )}

          {userRole === "admin" && (
            <Link
              href="/leads/import"
              className="inline-flex items-center gap-1.5 border border-line bg-panel text-ink hover:bg-slate-50 rounded-md text-xs font-semibold h-8 px-3 transition-colors shadow-2xs"
              title="Import Meta Lead Ads CSV"
            >
              <svg className="w-3.5 h-3.5 text-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Import</span>
            </Link>
          )}

          <button
            onClick={() => setIsAddLeadOpen(true)}
            className="inline-flex items-center gap-1.5 bg-accent hover:bg-[#15342c] text-white text-xs font-semibold h-8 px-3.5 rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add lead
          </button>
        </div>
      </div>

      {/* 2. Action-oriented Work Queues & Sources Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        {/* Work Queues - Primary navigation group */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-subtle uppercase tracking-wider mr-0.5 hidden sm:inline">
            Queue:
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-line rounded-lg shadow-xs">
            <button
              type="button"
              onClick={() => setView("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                view === "all"
                  ? "bg-accent text-white shadow-xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <span>All leads</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${view === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                {queueCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setView(view === "new" ? "all" : "new")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                view === "new"
                  ? "bg-accent text-white shadow-xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${view === "new" ? "bg-emerald-300" : "bg-emerald-600"}`} />
              <span>New</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${view === "new" ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-800"}`}>
                {queueCounts.new}
              </span>
            </button>

          </div>
        </div>

        {/* Source Filters - Quieter secondary filter pills in dedicated surface */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-subtle uppercase tracking-wider mr-0.5 hidden sm:inline">
            Source:
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-line rounded-lg shadow-xs">
            <button
              type="button"
              onClick={() => {
                setSource("all");
                setCampaign("all");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                source === "all"
                  ? "bg-slate-100 text-ink border border-slate-300 font-semibold shadow-2xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <span>All sources</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${source === "all" ? "bg-white text-ink shadow-2xs" : "bg-slate-100 text-subtle"}`}>
                {sourceCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = source === "google_ads" ? "all" : "google_ads";
                setSource(next);
                if (next === "all") setCampaign("all");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                source === "google_ads"
                  ? "bg-blue-50 text-blue-900 border border-blue-300 font-semibold shadow-2xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.825-.07-1.635-.205-2.415H12v4.545h6.63c-.285 1.485-1.11 2.745-2.355 3.585v2.955h3.795c2.22-2.055 3.51-5.07 3.51-8.67Z"/><path fill="#34A853" d="M12 24c3.24 0 5.955-1.08 7.935-2.91l-3.795-2.955c-1.08.735-2.46 1.155-4.14 1.155-3.18 0-5.88-2.145-6.84-5.025H1.245v3.06C3.21 21.36 7.29 24 12 24Z"/><path fill="#FBBC05" d="M5.16 15.265c-.24-.735-.375-1.53-.375-2.355 0-.825.135-1.62.375-2.355v-3.06H1.245A11.967 11.967 0 0 0 0 12.91c0 1.935.465 3.765 1.245 5.415l3.915-3.06Z"/><path fill="#EA4335" d="M12 4.71c1.755 0 3.345.6 4.59 1.785l3.435-3.435C17.94 1.155 15.225 0 12 0 7.29 0 3.21 2.64 1.245 6.495l3.915 3.06c.96-2.88 3.66-5.025 6.84-5.025Z"/></svg>
              <span>Google Ads</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${source === "google_ads" ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-subtle"}`}>
                {sourceCounts.google_ads}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = source === "meta_ads" ? "all" : "meta_ads";
                setSource(next);
                if (next === "all") setCampaign("all");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                source === "meta_ads"
                  ? "bg-blue-50 text-blue-900 border border-blue-300 font-semibold shadow-2xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              <span>Meta Ads</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${source === "meta_ads" ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-subtle"}`}>
                {sourceCounts.meta_ads}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = source === "99acres" ? "all" : "99acres";
                setSource(next);
                if (next === "all") setCampaign("all");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                source === "99acres"
                  ? "bg-teal-50 text-teal-900 border border-teal-300 font-semibold shadow-2xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <span className="text-teal-700 font-black text-[10px]">99</span>
              <span>99acres</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${source === "99acres" ? "bg-teal-100 text-teal-900" : "bg-slate-100 text-subtle"}`}>
                {sourceCounts["99acres"]}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = source === "magicbricks" ? "all" : "magicbricks";
                setSource(next);
                if (next === "all") setCampaign("all");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                source === "magicbricks"
                  ? "bg-rose-50 text-rose-900 border border-rose-300 font-semibold shadow-2xs"
                  : "text-subtle hover:text-ink hover:bg-slate-50 font-medium"
              }`}
            >
              <span className="bg-red-600 text-white rounded-[2px] text-[8px] px-0.5 font-bold">mb</span>
              <span>MagicBricks</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${source === "magicbricks" ? "bg-rose-100 text-rose-900" : "bg-slate-100 text-subtle"}`}>
                {sourceCounts.magicbricks}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Compact Search & Filter Toolbar */}
      <div className="bg-white border border-line rounded-lg p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, project..."
              className="w-full rounded-md border border-line bg-white pl-8 pr-12 h-8 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 font-medium placeholder:text-subtle transition-all shadow-2xs"
            />
            <svg
              className="w-3.5 h-3.5 text-subtle absolute left-2.5 top-2.5 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1.5 p-1 rounded text-subtle hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                title="Clear search"
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <span className="absolute right-2.5 top-2 text-[10px] font-mono text-subtle/80 pointer-events-none">
                ⌘K
              </span>
            )}
          </div>

          {/* Primary Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset */}
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="h-8 text-xs font-medium border border-line rounded-md px-2.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 cursor-pointer transition-colors hover:border-slate-400"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 days</option>
              <option value="last30days">Last 30 days</option>
              <option value="thisMonth">This month</option>
              <option value="all">All time</option>
              <option value="custom">Custom range...</option>
            </select>

            {/* Custom Date Pickers */}
            {datePreset === "custom" && (
              <div className="inline-flex items-center gap-1 text-xs">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-line rounded-md px-2 h-8 bg-white text-ink text-xs shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <span className="text-subtle">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-line rounded-md px-2 h-8 bg-white text-ink text-xs shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            )}

            {/* Campaign selector (active when specific source is picked) */}
            {source !== "all" && availableCampaigns.length > 0 && (
              <select
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="h-8 text-xs font-medium border border-line rounded-md px-2.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 max-w-[180px] truncate cursor-pointer transition-colors hover:border-slate-400"
              >
                <option value="all">All campaigns</option>
                {availableCampaigns.map((c) => (
                  <option key={c} value={c}>{truncate(c, 30).display}</option>
                ))}
              </select>
            )}

            {/* More Filters Toggle */}
            <button
              type="button"
              onClick={() => setIsMoreFiltersOpen(!isMoreFiltersOpen)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium border rounded-md h-8 px-2.5 transition-colors cursor-pointer shadow-2xs ${
                moreFiltersActiveCount > 0 || isMoreFiltersOpen
                  ? "bg-accent-soft text-accent border-accent/40 font-semibold"
                  : "bg-white text-ink border-line hover:bg-slate-50 hover:border-slate-400"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>More filters</span>
              {moreFiltersActiveCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {moreFiltersActiveCount}
                </span>
              )}
            </button>

            {/* Reset Button */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 h-8 px-2 hover:bg-rose-50 rounded transition-colors cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Expandable More Filters Panel */}
        {isMoreFiltersOpen && (
          <div className="pt-2.5 border-t border-line grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 animate-in fade-in duration-150">
            <div>
              <label className="block text-[11px] font-medium text-subtle mb-1">Ad Group / Ad Set</label>
              <select
                value={adGroup}
                onChange={(e) => setAdGroup(e.target.value)}
                className="w-full text-xs font-medium border border-line rounded-md px-2.5 py-1.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors hover:border-slate-400"
              >
                <option value="all">All ad groups</option>
                {adGroupOptions.map((opt) => (
                  <option key={opt} value={opt}>{truncate(opt, 30).display}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-subtle mb-1">Budget Range</label>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full text-xs font-medium border border-line rounded-md px-2.5 py-1.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors hover:border-slate-400"
              >
                <option value="all">All budgets</option>
                {budgetOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-subtle mb-1">BHK Configuration</label>
              <select
                value={bhk}
                onChange={(e) => setBhk(e.target.value)}
                className="w-full text-xs font-medium border border-line rounded-md px-2.5 py-1.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors hover:border-slate-400"
              >
                <option value="all">All BHKs</option>
                {bhkOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-subtle mb-1">Planning Timeline</label>
              <select
                value={planning}
                onChange={(e) => setPlanning(e.target.value)}
                className="w-full text-xs font-medium border border-line rounded-md px-2.5 py-1.5 bg-white text-ink shadow-2xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors hover:border-slate-400"
              >
                <option value="all">All timelines</option>
                {planningOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Active Filters Pill Chips */}
        {isFiltered && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-line text-[11px]">
            <span className="text-subtle font-medium">Active filters:</span>
            {search.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 font-medium">
                Search: &quot;{search}&quot;
                <button onClick={() => setSearch("")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {view !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 font-medium">
                Queue: {view.replace("_", " ")}
                <button onClick={() => setView("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {source !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 font-medium">
                Source: {source}
                <button onClick={() => { setSource("all"); setCampaign("all"); }} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {campaign !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                Campaign: {truncate(campaign, 20).display}
                <button onClick={() => setCampaign("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {adGroup !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                Ad Group: {truncate(adGroup, 20).display}
                <button onClick={() => setAdGroup("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {budget !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                Budget: {budget}
                <button onClick={() => setBudget("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {bhk !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                BHK: {bhk}
                <button onClick={() => setBhk("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {planning !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                Timeline: {planning}
                <button onClick={() => setPlanning("all")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
            {datePreset !== "today" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-ink font-medium">
                Date: {datePreset}
                <button onClick={() => setDatePreset("today")} className="hover:text-ink font-bold cursor-pointer">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-panel px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold text-ink">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkSelectedAsViewed}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Mark as Viewed
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {unseenYesterdayLeads.length > 0 && (
        <UnseenYesterdaySection
          leads={unseenYesterdayLeads}
          onSelectLead={setSelectedLead}
          onToggleViewed={handleToggleViewed}
        />
      )}

      {leads.length === 0 ? (
        <EmptyState title="No leads yet." subtitle="Waiting for submissions…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No leads match your search or filters."
          subtitle="Try adjusting your date range, source, or clearing your active filters."
          onReset={handleResetFilters}
        />
      ) : (
        <>
          <LeadsTable
            leads={paginatedLeads}
            salesTeam={salesTeam}
            onAssignLead={handleAssignLead}
            selectedLeadId={selectedLead?.id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            onSelectLead={setSelectedLead}
            onToggleViewed={handleToggleViewed}
            highlightedRows={highlightedRows}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
          />
          <PaginationBar
            startItem={startItem}
            endItem={endItem}
            totalCount={filtered.length}
            pageSize={pageSize}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Slide-over Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        salesTeam={salesTeam}
        onClose={() => setSelectedLead(null)}
        onToggleViewed={handleToggleViewed}
        onRename={handleRenameLead}
        onAssign={handleAssignLead}
      />

      {/* Floating Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        >
          {toasts.map((toast) => {
            if (toast.message) {
              return (
                <div
                  key={toast.id}
                  className="pointer-events-auto bg-white border border-emerald-200 shadow-xl rounded-xl p-3 flex items-center justify-between gap-3 transition-all transform duration-300 w-80 text-gray-900"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-800 truncate">{toast.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissToast(toast.id)}
                    className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                    aria-label="Dismiss notification"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            }

            const lead = toast.lead;
            if (!lead) return null;

            const cleanPhone = lead.phone_number
              ? lead.phone_number.replace(/^p:/i, "").trim()
              : "";
            const waPhone = cleanPhone.replace(/[^0-9]/g, "");
            const waUrl = waPhone ? `https://wa.me/${waPhone}` : null;

            return (
              <div
                key={toast.id}
                className="pointer-events-auto bg-white border border-emerald-200 shadow-xl rounded-xl p-4 flex flex-col gap-2.5 transition-all transform duration-300 w-80 text-gray-900"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      New Lead Received
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissToast(toast.id)}
                    className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100 transition-colors cursor-pointer"
                    title="Dismiss"
                    aria-label="Dismiss notification"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {lead.full_name || "New Prospect"}
                    </span>
                    <SourceBadge source={lead.source} />
                  </div>
                  {cleanPhone ? (
                    <span className="text-xs text-gray-600 font-mono">{cleanPhone}</span>
                  ) : null}
                  {lead.campaign_name ? (
                    <span className="text-xs text-gray-500 truncate max-w-[180px]">
                      🎯 {lead.campaign_name}
                    </span>
                  ) : null}
                </div>

                {/* Action Footer */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleToastView(lead, toast.id)}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-sm text-center transition-colors cursor-pointer"
                  >
                    View Lead
                  </button>
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddLeadDrawer 
        isOpen={isAddLeadOpen} 
        onClose={() => setIsAddLeadOpen(false)} 
        onLeadAdded={(lead) => setLeads((prev) => [lead, ...prev])} 
      />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  onReset,
}: {
  title: string;
  subtitle?: string;
  onReset?: () => void;
}) {
  return (
    <div className="border border-line rounded-lg bg-white py-14 text-center shadow-xs px-4">
      <div className="w-10 h-10 rounded-full bg-slate-100 border border-line mx-auto flex items-center justify-center text-subtle mb-3">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {subtitle && <p className="text-xs text-subtle mt-1 max-w-sm mx-auto">{subtitle}</p>}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-accent-soft text-accent border border-accent/40 hover:bg-accent hover:text-white transition-colors cursor-pointer"
        >
          Reset all filters
        </button>
      )}
    </div>
  );
}

function LeadsTable({
  leads,
  salesTeam,
  onAssignLead,
  selectedLeadId,
  sortKey,
  sortDir,
  onSort,
  onSelectLead,
  onToggleViewed,
  highlightedRows,
  selectedIds,
  setSelectedIds,
}: {
  leads: Lead[];
  salesTeam: SalesRep[];
  onAssignLead: (leadId: string, repId: string | null) => Promise<void | { error: string | null }>;
  selectedLeadId?: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelectLead: (lead: Lead) => void;
  onToggleViewed: (lead: Lead) => void;
  highlightedRows: Set<string>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const allPageSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COL_WIDTHS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rba_lead_col_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        setColWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  function handleResizeColumn(key: ColumnKey, newWidth: number) {
    setColWidths((prev) => {
      const updated = { ...prev, [key]: newWidth };
      try {
        localStorage.setItem("rba_lead_col_widths", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  function handleResetColumn(key: ColumnKey) {
    setColWidths((prev) => {
      const updated = { ...prev, [key]: DEFAULT_COL_WIDTHS[key] };
      try {
        localStorage.setItem("rba_lead_col_widths", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  const totalTableWidth =
    40 +
    colWidths.time +
    colWidths.source +
    colWidths.name +
    colWidths.phone +
    colWidths.campaign +
    colWidths.status;

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        leads.forEach((lead) => next.delete(lead.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...leads.map((lead) => lead.id)]));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 font-bold text-accent">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div className="border border-line rounded-lg bg-white overflow-auto max-h-[calc(100vh-230px)] shadow-xs relative isolate">
      <table
        className="w-full text-sm border-separate border-spacing-0 table-fixed"
        style={{ minWidth: `${totalTableWidth}px` }}
      >
        <colgroup>
          <col style={{ width: "40px" }} />
          <col style={{ width: `${colWidths.time}px` }} />
          <col style={{ width: `${colWidths.source}px` }} />
          <col style={{ width: `${colWidths.name}px` }} />
          <col style={{ width: `${colWidths.phone}px` }} />
          <col style={{ width: `${colWidths.campaign}px` }} />
          <col style={{ width: `${colWidths.status}px` }} />
        </colgroup>
        <thead className="sticky top-0 z-20 bg-[#E5EAF0]">
          <tr className="text-left text-xs bg-[#E5EAF0]">
            <Th className="w-[40px] px-3.5"><input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="rounded border-line accent-accent cursor-pointer" /></Th>
            <ResizableTh
              width={colWidths.time}
              minWidth={MIN_COL_WIDTHS.time}
              onResize={(w) => handleResizeColumn("time", w)}
              onReset={() => handleResetColumn("time")}
              onClick={() => onSort("time")}
            >
              Date & Time{sortIndicator("time")}
            </ResizableTh>
            <ResizableTh
              width={colWidths.source}
              minWidth={MIN_COL_WIDTHS.source}
              onResize={(w) => handleResizeColumn("source", w)}
              onReset={() => handleResetColumn("source")}
            >
              Source
            </ResizableTh>
            <ResizableTh
              width={colWidths.name}
              minWidth={MIN_COL_WIDTHS.name}
              onResize={(w) => handleResizeColumn("name", w)}
              onReset={() => handleResetColumn("name")}
              onClick={() => onSort("name")}
            >
              Name{sortIndicator("name")}
            </ResizableTh>
            <ResizableTh
              width={colWidths.phone}
              minWidth={MIN_COL_WIDTHS.phone}
              onResize={(w) => handleResizeColumn("phone", w)}
              onReset={() => handleResetColumn("phone")}
            >
              Phone & Actions
            </ResizableTh>
            <ResizableTh
              width={colWidths.campaign}
              minWidth={MIN_COL_WIDTHS.campaign}
              onResize={(w) => handleResizeColumn("campaign", w)}
              onReset={() => handleResetColumn("campaign")}
            >
              Campaign
            </ResizableTh>
            <ResizableTh
              width={colWidths.status}
              minWidth={MIN_COL_WIDTHS.status}
              onResize={(w) => handleResizeColumn("status", w)}
              onReset={() => handleResetColumn("status")}
            >
              Status
            </ResizableTh>
          </tr>
        </thead>
        <tbody className="bg-white">
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
                    ? "bg-emerald-50/80 hover:bg-emerald-50"
                    : highlightedRows.has(lead.id)
                    ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "bg-white hover:bg-slate-50/80"
                }`}
              >
                {/* Checkbox */}
                <Td className="w-[40px] px-3.5" onClick={(e: any) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleOne(lead.id)} className="rounded border-line accent-accent cursor-pointer" />
                </Td>
                
                {/* Date & Time */}
                <Td className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    {isNew && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-emerald-600 shrink-0 ring-2 ring-emerald-200"
                        title="New unread lead"
                        aria-hidden
                      />
                    )}
                    {(() => {
                      const { dateStr, timeStr } = formatLeadDateTime(lead.source_submitted_at);
                      return (
                        <div className="flex flex-col" suppressHydrationWarning>
                          <span className="font-semibold text-xs text-ink" suppressHydrationWarning>
                            {dateStr}
                          </span>
                          <span className="text-[11px] text-subtle font-mono" suppressHydrationWarning>
                            {timeStr}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </Td>

                {/* Source Badge */}
                <Td className="overflow-hidden">
                  <SourceBadge source={lead.source} platform={lead.platform} />
                </Td>

                {/* Name & Email */}
                <Td className="overflow-hidden">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5 truncate">
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
                <Td className="overflow-hidden min-w-[175px]">
                  <PhoneCell
                    phone={lead.phone_number}
                    fullName={lead.full_name}
                    campaignName={lead.campaign_name}
                  />
                </Td>

                {/* Campaign & Child Ad Group */}
                <Td title={lead.campaign_name || undefined} className="overflow-hidden">
                  <div className="flex flex-col gap-0.5 max-w-[280px] xl:max-w-none">
                    <span className="text-xs font-medium text-ink truncate">
                      {campaign.title}
                    </span>
                    {lead.ad_group_name && lead.ad_group_name.trim() !== "" && lead.ad_group_name !== "—" && (
                      <div className="flex items-center gap-1 text-[11px] text-subtle truncate" title={`Ad Group: ${lead.ad_group_name}`}>
                        <span className="text-subtle/50 font-mono text-[10px]">↳</span>
                        <span className="truncate">{lead.ad_group_name}</span>
                      </div>
                    )}
                    {campaign.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {campaign.badges.map((b) => (
                          <span
                            key={b}
                            className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded border border-slate-200 font-medium"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Td>

                {/* Status */}
                <Td className="overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleViewed(lead);
                    }}
                    className={`text-xs border rounded-md px-2.5 py-1 transition-colors whitespace-nowrap font-medium shadow-2xs ${
                      isNew
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 font-semibold"
                        : "border-line bg-white hover:bg-slate-50 text-subtle hover:text-ink"
                    }`}
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

function ResizableTh({
  children,
  onClick,
  width,
  minWidth = 80,
  onResize,
  onReset,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  width: number;
  minWidth?: number;
  onResize: (newWidth: number) => void;
  onReset?: () => void;
  className?: string;
}) {
  const [isResizing, setIsResizing] = useState(false);

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startWidth = width;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.round(Math.max(minWidth, startWidth + delta));
      onResize(nextWidth);
    }

    function onMouseUp() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <th
      onClick={onClick}
      style={{ width: `${width}px`, minWidth: `${minWidth}px` }}
      className={`px-3.5 py-3 text-[11px] font-semibold tracking-wider text-[#17212F] bg-[#E5EAF0] border-b-2 border-[#D5DCE5] whitespace-nowrap relative select-none group/th ${
        onClick ? "cursor-pointer hover:bg-[#D8DFE8]" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 pr-2 overflow-hidden">{children}</div>

      {/* Meta Ads Manager style Column Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onReset?.();
        }}
        onClick={(e) => e.stopPropagation()}
        className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center z-10 group/handle ${
          isResizing ? "bg-accent/15" : ""
        }`}
        title="Drag to resize column (Double-click to reset)"
      >
        <div
          className={`w-[2px] h-3.5 rounded-full transition-colors ${
            isResizing
              ? "bg-accent h-full"
              : "bg-[#B0BCCB] group-hover/handle:bg-accent group-hover/th:bg-subtle/50"
          }`}
        />
      </div>
    </th>
  );
}

function Th({ children, onClick, className = "" }: { children?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3.5 py-3 text-[11px] font-semibold tracking-wider text-[#17212F] bg-[#E5EAF0] border-b-2 border-[#D5DCE5] whitespace-nowrap ${
        onClick ? "cursor-pointer hover:bg-[#D8DFE8]" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-1.5">{children}</div>
    </th>
  );
}

function Td({ children, title, className = "", onClick }: { children: React.ReactNode; title?: string; className?: string; onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void }) {
  return (
    <td className={`px-3.5 py-3 align-middle text-ink whitespace-nowrap border-b border-[#D5DCE5] ${className}`} title={title} onClick={onClick}>
      {children}
    </td>
  );
}

function PaginationBar({
  startItem,
  endItem,
  totalCount,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPageChange,
}: {
  startItem: number;
  endItem: number;
  totalCount: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
}) {
  return (
    <div className="bg-white border border-line rounded-lg p-3 px-4 flex flex-wrap items-center justify-between gap-4 text-xs shadow-xs">
      {/* Left side: Showing X to Y of Z leads */}
      <div className="text-subtle font-medium">
        Showing <span className="font-semibold text-ink">{startItem}</span> to{" "}
        <span className="font-semibold text-ink">{endItem}</span> of{" "}
        <span className="font-semibold text-ink">{totalCount}</span> leads
      </div>

      {/* Right side controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Rows per page selector */}
        <div className="flex items-center gap-2">
          <span className="text-subtle font-medium">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-white border border-line rounded-md px-2 py-1 text-ink font-medium shadow-2xs outline-none focus:border-accent hover:border-slate-400 transition-colors"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {/* Page indicator */}
        <div className="text-subtle font-medium">
          Page <span className="font-semibold text-ink">{currentPage}</span> of{" "}
          <span className="font-semibold text-ink">{totalPages}</span>
        </div>

        {/* Previous & Next buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            className="px-2.5 py-1 rounded-md border border-line bg-white text-ink font-semibold shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
            className="px-2.5 py-1 rounded-md border border-line bg-white text-ink font-semibold shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
