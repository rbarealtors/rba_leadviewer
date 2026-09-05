"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/lib/leads/types";
import { formatIST } from "@/lib/time";
import { formatCampaignName, sanitizePhoneForCopy, buildWhatsAppUrl } from "@/lib/leads/formatters";
import { SourceBadge } from "./SourceBadge";

export function LeadDetailDrawer({
  lead,
  onClose,
  onToggleViewed,
  onRename,
}: {
  lead: Lead | null;
  onClose: () => void;
  onToggleViewed: (lead: Lead) => void;
  onRename: (leadId: string, fullName: string) => Promise<{ error: string | null }>;
}) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  // Close drawer on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isEditingName) {
          setIsEditingName(false);
          setNameError(null);
        } else {
          onClose();
        }
      }
    }
    if (lead) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isEditingName, lead, onClose]);

  if (!lead) return null;

  function startEditingName() {
    if (!lead) return;
    setNameDraft(lead.full_name || "");
    setNameError(null);
    setIsEditingName(true);
  }

  function cancelEditingName() {
    setIsEditingName(false);
    setNameError(null);
  }

  async function saveName() {
    if (!lead) return;
    const fullName = nameDraft.trim();
    setIsSavingName(true);
    setNameError(null);
    const result = await onRename(lead.id, fullName);
    setIsSavingName(false);
    if (result.error) {
      setNameError(result.error);
      return;
    }
    setIsEditingName(false);
  }

  const isNew = !lead.viewed_at;
  const campaign = formatCampaignName(lead.campaign_name);
  const cleanPhone = lead.phone_number ? lead.phone_number.replace(/^p:/i, "").trim() : "";
  const waUrl = buildWhatsAppUrl(
    lead.phone_number,
    lead.full_name,
    campaign.title && campaign.title !== "—" ? campaign.title : lead.campaign_name
  );

  async function handleCopyPhone() {
    if (!lead?.phone_number) return;
    const toCopy = sanitizePhoneForCopy(lead.phone_number);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(toCopy);
      }
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  }

  async function handleCopyPayload() {
    if (!lead?.raw_payload) return;
    try {
      const json = JSON.stringify(lead.raw_payload, null, 2);
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      }
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-panel shadow-2xl flex flex-col border-l border-line z-50 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-line bg-canvas/40 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <SourceBadge source={lead.source} platform={lead.platform} />
              {isNew ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-new" />
                  New
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas text-subtle border border-line">
                  Viewed
                </span>
              )}
            </div>
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") cancelEditingName();
                  }}
                  className="min-w-0 w-48 rounded-md border border-line bg-panel px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  aria-label="Lead name"
                  autoFocus
                />
                <button
                  onClick={() => void saveName()}
                  disabled={isSavingName}
                  className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  title="Save name"
                  aria-label="Save name"
                >
                  ✓
                </button>
                <button
                  onClick={cancelEditingName}
                  disabled={isSavingName}
                  className="rounded-md p-1 text-subtle hover:bg-line/40 hover:text-ink disabled:opacity-50"
                  title="Cancel editing"
                  aria-label="Cancel editing"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className={`text-base font-bold truncate ${lead.full_name ? "text-ink" : "text-subtle italic"}`}>
                  {lead.full_name || "Click to add name"}
                </h2>
                <button
                  onClick={startEditingName}
                  className="shrink-0 rounded-md p-1 text-subtle hover:bg-line/40 hover:text-ink"
                  title="Edit lead name"
                  aria-label="Edit lead name"
                >
                  ✎
                </button>
              </div>
            )}
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
            <p className="text-xs text-subtle mt-0.5" suppressHydrationWarning>
              Submitted {formatIST(lead.source_submitted_at)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-subtle hover:text-ink hover:bg-line/40 transition-colors"
            title="Close drawer (Esc)"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Quick Action Toolbar */}
        <div className="px-6 py-3 bg-panel border-b border-line flex flex-wrap items-center gap-2">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-xs transition-colors"
              title="Open WhatsApp Web chat"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span>WhatsApp Chat</span>
            </a>
          )}

          {cleanPhone && (
            <button
              onClick={handleCopyPhone}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                copiedPhone
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-panel text-ink hover:bg-canvas border-line"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copiedPhone ? "Copied Phone!" : "Copy Phone"}</span>
            </button>
          )}

          <button
            onClick={() => onToggleViewed(lead)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              isNew
                ? "bg-accent-soft text-accent border-accent/40 hover:bg-accent hover:text-white"
                : "bg-panel text-subtle hover:text-ink border-line hover:bg-canvas"
            }`}
          >
            {isNew ? "Mark as Viewed" : "Mark as Unread"}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Lead Contact Card */}
          <section className="bg-canvas/50 border border-line rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">
              Contact Details
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-subtle text-xs">Full Name</span>
                <span className="font-semibold text-ink">{lead.full_name || "—"}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-subtle text-xs">Phone Number</span>
                <span className="font-mono text-ink">
                  {cleanPhone ? (
                    <a href={`tel:${cleanPhone}`} className="hover:underline text-accent font-semibold">
                      {cleanPhone}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-subtle text-xs">Email Address</span>
                <span className="font-mono text-ink">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="hover:underline text-accent">
                      {lead.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
          </section>

          {/* Marketing Source & Meta Information */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">
              Source & Campaign Details
            </h3>

            <div className="space-y-2 text-sm bg-panel border border-line rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Source Channel</span>
                <SourceBadge source={lead.source} platform={lead.platform} />
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Campaign Name</span>
                <div className="text-right">
                  <span className="font-semibold text-ink block">{campaign.title}</span>
                  {campaign.badges.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1 mt-1">
                      {campaign.badges.map((badge) => (
                        <span
                          key={badge}
                          className="text-[10px] px-1.5 py-0.2 bg-canvas text-subtle rounded border border-line font-medium"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Ad Group / Ad Set</span>
                <span className="text-xs font-medium text-ink text-right">
                  {lead.ad_group_name || "—"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Ad Name</span>
                <span className="text-xs font-medium text-ink text-right">
                  {lead.ad_name || "—"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Submitted At</span>
                <span className="text-xs font-medium text-ink text-right" suppressHydrationWarning>
                  {formatIST(lead.source_submitted_at)}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-subtle">Lead ID</span>
                <span className="text-xs font-mono text-subtle text-right break-all">
                  {lead.external_lead_id}
                </span>
              </div>
            </div>
          </section>

          {/* Questionnaire Fields */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">
              Questionnaire & Preferences
            </h3>
            {lead.budget_range || lead.bhk_configuration || lead.planning_timeline ? (
              <div className="grid grid-cols-1 gap-2.5">
                {lead.budget_range && (
                  <div className="p-3 bg-canvas/50 border border-line rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs text-subtle block">Budget Range</span>
                      <span className="font-semibold text-ink text-sm">{lead.budget_range}</span>
                    </div>
                  </div>
                )}

                {lead.bhk_configuration && (
                  <div className="p-3 bg-canvas/50 border border-line rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs text-subtle block">BHK Configuration</span>
                      <span className="font-semibold text-ink text-sm">{lead.bhk_configuration}</span>
                    </div>
                  </div>
                )}

                {lead.planning_timeline && (
                  <div className="p-3 bg-canvas/50 border border-line rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs text-subtle block">Planning Timeline</span>
                      <span className="font-semibold text-ink text-sm">{lead.planning_timeline}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-canvas/30 border border-line/60 rounded-lg text-center text-subtle text-xs">
                No questionnaire responses provided for this lead.
              </div>
            )}
          </section>

          {/* Raw Payload Section */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">
                Raw Payload Debug Data
              </h3>
              {lead.raw_payload && (
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  {copiedPayload ? "Copied JSON!" : "Copy Raw JSON"}
                </button>
              )}
            </div>

            <pre className="p-4 bg-canvas border border-line rounded-xl text-xs font-mono text-ink overflow-x-auto max-h-60 whitespace-pre-wrap break-all leading-relaxed">
              {lead.raw_payload ? JSON.stringify(lead.raw_payload, null, 2) : "No raw payload available."}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
