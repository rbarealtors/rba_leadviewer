"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, XIcon, CheckIcon } from "@/components/sales/icons";

export interface PipelineStageOption {
  id: string;
  label: string;
  description?: string;
  dotColor: string;
}

export const PIPELINE_STAGES: PipelineStageOption[] = [
  { id: "ALL", label: "All leads", description: "All active and completed leads", dotColor: "bg-slate-400" },
  { id: "NEW", label: "New", description: "Freshly assigned, not yet contacted", dotColor: "bg-blue-500" },
  { id: "CONTACTED", label: "Contacted", description: "Calls attempted or connected", dotColor: "bg-amber-500" },
  { id: "SITE_VISIT", label: "Site Visit", description: "Visits scheduled or completed", dotColor: "bg-purple-500" },
  { id: "BOOKING", label: "Booking", description: "Unit selected, token in progress", dotColor: "bg-indigo-500" },
  { id: "CLOSED", label: "Closed", description: "Token received, deal won", dotColor: "bg-emerald-500" },
  { id: "LOST", label: "Lost", description: "Unqualified or dropped leads", dotColor: "bg-red-500" },
];

const DEFAULT_STAGE: PipelineStageOption = {
  id: "ALL",
  label: "All leads",
  description: "All active and completed leads",
  dotColor: "bg-slate-400",
};

interface PipelineFilterControlProps {
  currentStage: string;
  searchQuery?: string;
}

export function PipelineFilterControl({
  currentStage,
  searchQuery = "",
}: PipelineFilterControlProps) {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedStage = (currentStage || "ALL").toUpperCase();
  const activeOption =
    PIPELINE_STAGES.find((s) => s.id === normalizedStage) ?? DEFAULT_STAGE;

  return (
    <>
      {/* Compact Current-Filter Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-white rounded-xl text-sm font-medium border border-slate-700/60 shadow-xs transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${activeOption.dotColor} flex-shrink-0`} />
          <span className="font-semibold text-slate-100 truncate">{activeOption.label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
          <span className="text-xs text-slate-400 font-normal">Change</span>
          <ChevronDownIcon className="w-4 h-4 text-slate-400" />
        </div>
      </button>

      {/* Mobile Bottom Sheet Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Filter pipeline by stage"
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-900">Pipeline Stages</h2>
                <p className="text-xs text-slate-500 mt-0.5">Select a category to filter leads</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
                aria-label="Close stage filter"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Stage Options */}
            <div className="p-6 overflow-y-auto space-y-2.5">
              {PIPELINE_STAGES.map((stage) => {
                const isSelected = activeOption.id === stage.id;
                const href = `/sales/pipeline?stage=${stage.id}${
                  searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
                }`;

                return (
                  <Link
                    key={stage.id}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={`w-full p-3.5 rounded-xl text-sm font-semibold transition-all border flex items-center justify-between ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs"
                        : "border-slate-150 bg-white text-slate-700 hover:border-slate-300 active:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${stage.dotColor} flex-shrink-0`} />
                      <div className="text-left truncate">
                        <div className="font-bold text-slate-900 leading-snug">{stage.label}</div>
                        {stage.description && (
                          <div className="text-xs text-slate-500 font-normal mt-0.5 truncate">
                            {stage.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckIcon className="w-5 h-5 text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-slate-100 flex-shrink-0 bg-slate-50 rounded-b-none">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-300 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
