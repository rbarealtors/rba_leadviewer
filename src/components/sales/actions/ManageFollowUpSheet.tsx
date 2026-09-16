"use client";

import { useState } from "react";
import { updateLeadFollowUpAction } from "@/app/sales/workflow-actions";
import { XIcon, ClockIcon } from "../icons";
import { addDays, toInputDate, formatDateTime } from "@/lib/date-utils";

interface ManageFollowUpSheetProps {
  leadId: string;
  currentFollowUp?: string | null;
  onClose: () => void;
}

export function ManageFollowUpSheet({
  leadId,
  currentFollowUp,
  onClose,
}: ManageFollowUpSheetProps) {
  // Initialize date & time from currentFollowUp or default to tomorrow at 10:00
  const initialDate = currentFollowUp
    ? toInputDate(new Date(currentFollowUp))
    : toInputDate(addDays(new Date(), 1));

  const initialTime = currentFollowUp
    ? (() => {
        const d = new Date(currentFollowUp);
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : "10:00";

  const [date, setDate] = useState<string>(initialDate);
  const [time, setTime] = useState<string>(initialTime);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    const res = await updateLeadFollowUpAction(leadId, scheduledAt);
    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    setError(null);

    const res = await updateLeadFollowUpAction(leadId, null);
    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  const handleQuickSelect = (daysFromNow: number, targetTime = "10:00") => {
    setDate(toInputDate(addDays(new Date(), daysFromNow)));
    setTime(targetTime);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-black text-slate-900">
                {currentFollowUp ? "Manage Follow-Up" : "Schedule Follow-Up"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {currentFollowUp && (
            <div className="mb-5 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex justify-between items-center">
              <div>
                <p className="font-bold text-amber-800">Currently Scheduled:</p>
                <p className="font-medium text-amber-700 mt-0.5">{formatDateTime(currentFollowUp)}</p>
              </div>
            </div>
          )}

          {/* Quick presets */}
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Quick Shortcuts
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleQuickSelect(1)}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect(3)}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                In 3 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect(7)}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Next Week
              </button>
            </div>
          </div>

          {/* Date and Time inputs */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Follow-Up Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={isSubmitting || !date || !time}
              onClick={handleSave}
              className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl disabled:bg-slate-300 disabled:text-slate-500 hover:bg-slate-800 transition-colors shadow-sm text-sm"
            >
              {isSubmitting ? "Saving..." : currentFollowUp ? "Update Follow-Up" : "Set Follow-Up"}
            </button>

            {currentFollowUp && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleClear}
                className="w-full bg-white text-red-600 border border-red-200 font-bold py-3.5 rounded-xl hover:bg-red-50 transition-colors text-sm"
              >
                Clear Follow-Up
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

