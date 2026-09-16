"use client";

import { useState } from "react";
import { updateSiteVisitStatusAction } from "@/app/sales/workflow-actions";
import { XIcon } from "../icons";
import { addDays, toInputDate } from "@/lib/date-utils";

type UpdateAction = "completed" | "cancelled" | "rescheduled";

export function UpdateVisitSheet({
  visitId,
  onClose,
}: {
  visitId: string;
  onClose: () => void;
}) {
  const [action, setAction] = useState<UpdateAction | null>(null);
  const [notes, setNotes] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState<string>(toInputDate(addDays(new Date(), 1)));
  const [rescheduleTime, setRescheduleTime] = useState<string>("10:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!action) return;
    setIsSubmitting(true);
    setError(null);

    let resolvedRescheduleDate = undefined;
    if (action === "rescheduled") {
      resolvedRescheduleDate = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();
    }

    const res = await updateSiteVisitStatusAction(visitId, action, notes, resolvedRescheduleDate);
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
            <h2 className="text-xl font-black text-slate-900">Update Visit</h2>
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
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Outcome
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setAction("completed")}
                className={`p-4 rounded-xl text-sm font-bold text-left transition-colors border-2 ${
                  action === "completed"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-slate-100 text-slate-700 hover:border-slate-300"
                }`}
              >
                Complete Visit
              </button>
              <button
                type="button"
                onClick={() => setAction("rescheduled")}
                className={`p-4 rounded-xl text-sm font-bold text-left transition-colors border-2 ${
                  action === "rescheduled"
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-slate-100 text-slate-700 hover:border-slate-300"
                }`}
              >
                Reschedule Visit
              </button>
              <button
                type="button"
                onClick={() => setAction("cancelled")}
                className={`p-4 rounded-xl text-sm font-bold text-left transition-colors border-2 ${
                  action === "cancelled"
                    ? "border-red-500 bg-red-50 text-red-800"
                    : "border-slate-100 text-slate-700 hover:border-slate-300"
                }`}
              >
                Cancel Visit
              </button>
            </div>
          </div>

          {action === "rescheduled" && (
            <div className="grid grid-cols-2 gap-4 mb-8 animate-in fade-in">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                  New Date
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                  New Time
                </label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          )}

          {action && (
            <div className="space-y-2 mb-8 animate-in fade-in">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Outcome or reason..."
                rows={2}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none"
              />
            </div>
          )}

          <button
            type="button"
            disabled={!action || isSubmitting}
            onClick={handleSubmit}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl disabled:bg-slate-300 hover:bg-slate-800 transition-colors shadow-sm"
          >
            {isSubmitting ? "Saving..." : "Save Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
