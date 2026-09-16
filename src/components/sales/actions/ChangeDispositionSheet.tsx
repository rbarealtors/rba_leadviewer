"use client";

import { useState } from "react";
import { type CrmDisposition, CANONICAL_DISPOSITIONS } from "@/lib/leads/types";
import { updateLeadDispositionAction } from "@/app/sales/workflow-actions";

import { XIcon, CheckIcon, TagIcon } from "../icons";

interface ChangeDispositionSheetProps {
  leadId: string;
  currentDisposition?: CrmDisposition | null;
  onClose: () => void;
}

export function ChangeDispositionSheet({
  leadId,
  currentDisposition,
  onClose,
}: ChangeDispositionSheetProps) {
  const [selected, setSelected] = useState<CrmDisposition>(
    currentDisposition || "Not Contacted"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (selected === currentDisposition) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await updateLeadDispositionAction(leadId, selected);
    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-black text-slate-900">Change Disposition</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-3">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Select Canonical CRM Disposition
          </p>

          <div className="space-y-2">
            {CANONICAL_DISPOSITIONS.map((disp) => {
              const isSelected = selected === disp;
              const isCurrent = currentDisposition === disp;

              return (
                <button
                  type="button"
                  key={disp}
                  onClick={() => setSelected(disp)}
                  className={`w-full p-3.5 rounded-xl text-sm font-semibold text-left transition-all border flex items-center justify-between ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm"
                      : "border-slate-150 bg-white text-slate-700 hover:border-slate-300 active:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        disp === "Closed — Won"
                          ? "bg-green-500"
                          : disp === "Closed — Lost"
                            ? "bg-red-500"
                            : disp === "Site Visit Done" || disp === "Site Visit Scheduled"
                              ? "bg-purple-500"
                              : disp === "Contacted — Interested"
                                ? "bg-blue-500"
                                : disp === "Budget Mismatch"
                                  ? "bg-amber-500"
                                  : "bg-slate-400"
                      }`}
                    />
                    <span>{disp}</span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  {isSelected && <CheckIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-slate-100 flex-shrink-0 bg-white">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl disabled:bg-slate-300 disabled:text-slate-500 hover:bg-slate-800 transition-colors shadow-sm text-sm"
          >
            {isSubmitting ? "Updating..." : "Save Disposition"}
          </button>
        </div>
      </div>
    </div>
  );
}
