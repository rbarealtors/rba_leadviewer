"use client";

import { useState } from "react";
import { recordContactOutcomeAction } from "@/app/sales/workflow-actions";
import { XIcon } from "../icons";
import { addDays, toInputDate } from "@/lib/date-utils";

type ContactOutcome =
  | "Connected"
  | "No Answer"
  | "Busy / Call Later"
  | "Wrong Number"
  | "Not Interested";

export function LogContactSheet({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>(toInputDate(addDays(new Date(), 1)));
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!outcome) return;
    setIsSubmitting(true);
    setError(null);

    let resolvedFollowUp = undefined;
    if (outcome === "No Answer" || outcome === "Busy / Call Later") {
      resolvedFollowUp = new Date(followUpDate).toISOString();
    }

    const res = await recordContactOutcomeAction(leadId, outcome, notes, resolvedFollowUp);
    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  const outcomes: ContactOutcome[] = [
    "Connected",
    "No Answer",
    "Busy / Call Later",
    "Wrong Number",
    "Not Interested",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-slate-900">Log Contact</h2>
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
            <div className="grid grid-cols-2 gap-3">
              {outcomes.map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`p-4 rounded-xl text-sm font-bold text-left transition-colors border-2 ${
                    outcome === o
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-slate-100 bg-white text-slate-700 hover:border-slate-300"
                  } ${o === "Connected" ? "col-span-2" : ""}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {(outcome === "No Answer" || outcome === "Busy / Call Later") && (
            <div className="space-y-2 mb-8 animate-in fade-in slide-in-from-top-4">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Next Follow-up
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
              />
            </div>
          )}

          {outcome === "Connected" && (
            <div className="space-y-2 mb-8 animate-in fade-in slide-in-from-top-4">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did they say?"
                rows={3}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 resize-none"
              />
            </div>
          )}

          <button
            type="button"
            disabled={!outcome || isSubmitting}
            onClick={handleSubmit}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl disabled:bg-slate-300 disabled:text-slate-500 hover:bg-slate-800 transition-colors shadow-sm"
          >
            {isSubmitting ? "Saving..." : "Save Outcome"}
          </button>
        </div>
      </div>
    </div>
  );
}
