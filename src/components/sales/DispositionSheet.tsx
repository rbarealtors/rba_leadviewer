"use client";

import { useEffect, useState, useTransition } from "react";
import { submitLeadDisposition } from "@/app/sales/sales-actions";

type Disposition = "Not Interested" | "Interested (Has Requirements)" | "Interested (Not Ready Yet / Soft Park)";

export function DispositionSheet({
  isOpen,
  onClose,
  leadId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [disposition, setDisposition] = useState<Disposition | null>(null);

  // Form State
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [bhk, setBhk] = useState("");
  const [readyToMove, setReadyToMove] = useState("");
  const [likes, setLikes] = useState("");
  const [holdingBack, setHoldingBack] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const [isPending, startTransition] = useTransition();

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      // Reset form
      setStep(1);
      setDisposition(null);
      setReason("");
      setNotes("");
      setBhk("");
      setReadyToMove("");
      setLikes("");
      setHoldingBack("");
      setFollowUpDate("");
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposition) return;

    let details: any = { notes };
    if (disposition === "Not Interested") {
      details.reason = reason;
    } else if (disposition === "Interested (Has Requirements)") {
      details.bhk = bhk;
      details.readyToMove = readyToMove;
    } else if (disposition === "Interested (Not Ready Yet / Soft Park)") {
      details.likes = likes;
      details.holdingBack = holdingBack;
    }

    startTransition(async () => {
      const { error } = await submitLeadDisposition(
        leadId,
        disposition,
        JSON.stringify(details),
        followUpDate || null
      );
      if (!error) {
        onSuccess();
      } else {
        alert(error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl sm:mb-8 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all transform duration-300 translate-y-0">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {step === 1 ? "Log Outcome" : "Additional Details"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 pb-6">
          {step === 1 ? (
            <div className="flex flex-col gap-3">
              {(["Not Interested", "Interested (Has Requirements)", "Interested (Not Ready Yet / Soft Park)"] as Disposition[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDisposition(d)}
                  className={`p-4 text-left rounded-xl border-2 transition-all ${disposition === d ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50"}`}
                >
                  <span className={`font-semibold ${disposition === d ? "text-emerald-800" : "text-slate-700"}`}>{d}</span>
                </button>
              ))}
            </div>
          ) : (
            <form id="disposition-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
              {disposition === "Not Interested" && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">Reason</span>
                    <select value={reason} onChange={e => setReason(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none">
                      <option value="">Select reason...</option>
                      <option value="no_requirement">No Requirement</option>
                      <option value="budget_mismatch">Budget Mismatch</option>
                      <option value="rnr">RNR (Ring No Response)</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </>
              )}

              {disposition === "Interested (Has Requirements)" && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">Preferred BHK</span>
                    <input type="text" value={bhk} onChange={e => setBhk(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="e.g. 2 BHK, 3 BHK" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">Ready to Move In?</span>
                    <select value={readyToMove} onChange={e => setReadyToMove(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none">
                      <option value="">Select...</option>
                      <option value="yes">Yes</option>
                      <option value="no">No, Under Construction</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">Follow-up Date</span>
                    <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </label>
                </>
              )}

              {disposition === "Interested (Not Ready Yet / Soft Park)" && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">What do they like?</span>
                    <input type="text" value={likes} onChange={e => setLikes(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">What is holding them back?</span>
                    <input type="text" value={holdingBack} onChange={e => setHoldingBack(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">Follow-up Date</span>
                    <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </label>
                </>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Pitch Notes / Comments</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none" placeholder="Any additional context..." />
              </label>
            </form>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3 pb-6 bg-white">
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!disposition}
              className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-[0.98]"
            >
              Continue
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-[0.98]"
              >
                Back
              </button>
              <button
                type="submit"
                form="disposition-form"
                disabled={isPending}
                className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-[0.98] disabled:opacity-70"
              >
                {isPending ? "Submitting..." : "Submit & Next"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
