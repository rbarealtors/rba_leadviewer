"use client";

import { useState } from "react";
import { scheduleSiteVisitAction } from "@/app/sales/workflow-actions";
import { XIcon } from "../icons";
import { addDays, toInputDate } from "@/lib/date-utils";

export function ScheduleVisitSheet({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState<string>(toInputDate(addDays(new Date(), 1)));
  const [time, setTime] = useState<string>("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    const res = await scheduleSiteVisitAction(leadId, {
      scheduled_at: scheduledAt,
      location,
      notes,
    });

    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-slate-900">Schedule Visit</h2>
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

          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                  Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Location / Property
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. RBA Elite Towers"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Client requirements..."
                rows={2}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 resize-none"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!date || !time || isSubmitting}
            onClick={handleSubmit}
            className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl disabled:bg-slate-300 transition-colors shadow-sm hover:bg-purple-700"
          >
            {isSubmitting ? "Scheduling..." : "Schedule Visit"}
          </button>
        </div>
      </div>
    </div>
  );
}
