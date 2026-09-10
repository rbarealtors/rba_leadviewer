"use client";

import { useState, useEffect } from "react";
import type { Lead } from "@/lib/leads/types";
import { DispositionSheet } from "./DispositionSheet";
import TransferModal from "./TransferModal";

interface LeadCardProps {
  lead: Lead;
  onTransferred: (leadId: string) => void;
}

function formatAssignedTime(dateString?: string | null): string {
  if (!dateString) return "Recently";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Recently";
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);

    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase();
    return `${hour}:${minute} ${dayPeriod}`;
  } catch {
    return "Recently";
  }
}

export default function LeadCard({ lead, onTransferred }: LeadCardProps) {
  const [isDispositionOpen, setIsDispositionOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // Formatting helpers
  const assignedIso = lead.assigned_at || lead.created_at;
  const timeDisplay = `Assigned ${formatAssignedTime(assignedIso)}`;

  useEffect(() => {
    if (!assignedIso) return;
    const diffMs = Date.now() - new Date(assignedIso).getTime();
    if (diffMs > 0 && diffMs < 30 * 60 * 1000) {
      setIsNew(true);
    }
  }, [assignedIso]);

  const cleanPhone = lead.phone_number?.replace(/^p:/i, "").trim() || "";
  const waPhone = cleanPhone.replace(/[^0-9]/g, "");
  const waUrl = waPhone ? `https://wa.me/${waPhone}` : "#";

  // Build key details text
  const locationText = lead.campaign_name ? lead.campaign_name.split("-")[0] : "Location Unspecified";
  const details = [lead.bhk_configuration, lead.budget_range].filter(Boolean).join(", ");
  const description = details ? `${locationText} - ${details}` : locationText;

  // Pills
  const pills = [
    lead.bhk_configuration,
    lead.budget_range,
    lead.planning_timeline,
    lead.disposition
  ].filter(Boolean) as string[];

  // Source badge config
  const getSourceBadge = (source: string) => {
    switch(source) {
      case "meta_ads": return { label: "Meta Ads", classes: "bg-[#EEEDFE] text-[#534AB7]" };
      case "google_ads": return { label: "Google Ads", classes: "bg-[#FAC775] text-[#633806]" };
      case "phone_call": return { label: "Phone", classes: "bg-[#E6F1FB] text-[#185FA5]" };
      default: return { label: "Other", classes: "bg-slate-100 text-slate-600" };
    }
  };

  const badge = getSourceBadge(lead.source);

  return (
    <div className={`relative bg-white rounded-xl shadow-sm overflow-hidden flex flex-col p-4 gap-4 ${isNew ? "border-2 border-[#1f4b3f]" : "border-[0.5px] border-slate-200"}`}>
      {isNew && (
        <span className="absolute top-0 left-0 bg-[#1f4b3f] text-white text-[11px] font-bold px-2 py-0.5 rounded-br-lg z-10">
          New
        </span>
      )}

      {/* Header */}
      <div className="flex justify-between items-start pt-2">
        <div>
          <h2 className="font-bold text-[15px] text-gray-900 leading-tight truncate pr-2 max-w-[200px]">
            {lead.full_name || "New Prospect"}
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5" suppressHydrationWarning>
            {timeDisplay}
          </p>
        </div>
        <span className={`text-[11px] px-2 py-1 rounded-full font-medium shrink-0 ${badge.classes}`}>
          {badge.label}
        </span>
      </div>

      {/* Body */}
      <div>
        <p className="font-bold text-[14px] text-gray-800 line-clamp-1">{description}</p>
        
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {pills.slice(0, 4).map((pill, i) => (
              <span key={i} className="bg-slate-50 border border-slate-100 text-slate-500 text-[11px] px-2 py-1 rounded-md">
                {pill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-1">
        {/* Row 1 */}
        <div className="flex gap-2 h-10">
          <a
            href={`tel:${cleanPhone}`}
            className="flex-1 bg-[#0F6E56] text-white font-medium rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <i className="ti ti-phone text-[16px]"></i>
            Call
          </a>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-[#25D366] text-white font-medium rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <i className="ti ti-message-circle text-[16px]"></i>
            WhatsApp
          </a>
        </div>
        
        {/* Row 2 */}
        <div className="flex gap-2 h-10">
          <button
            onClick={() => setIsTransferOpen(true)}
            className="flex-1 bg-slate-50 border border-slate-200 text-gray-900 font-medium rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <i className="ti ti-arrow-right text-[14px]"></i>
            Transfer
          </button>
          <button
            onClick={() => setIsDispositionOpen(true)}
            className="flex-1 bg-[#1f4b3f] text-white font-medium rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <i className="ti ti-note text-[14px]"></i>
            Log outcome
          </button>
        </div>
      </div>

      <DispositionSheet
        isOpen={isDispositionOpen}
        onClose={() => setIsDispositionOpen(false)}
        leadId={lead.id}
        onSuccess={() => setIsDispositionOpen(false)}
      />

      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        lead={lead}
        onSuccess={() => {
          setIsTransferOpen(false);
          onTransferred(lead.id);
        }}
      />
    </div>
  );
}
