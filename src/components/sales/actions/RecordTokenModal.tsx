"use client";

import { useState } from "react";
import { recordTokenAndCloseAction } from "@/app/sales/workflow-actions";
import { XIcon, ShieldCheckIcon } from "../icons";
import { toInputDate } from "@/lib/date-utils";

export function RecordTokenModal({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState<string>(toInputDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!amount || !referenceNumber.trim() || !isConfirmed) return;
    setIsSubmitting(true);
    setError(null);

    const res = await recordTokenAndCloseAction(leadId, {
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      reference_number: referenceNumber.trim(),
      received_at: new Date(receivedDate).toISOString(),
    });

    if (res?.error) {
      setError(res.error);
      setIsSubmitting(false);
      return;
    }

    onClose();
  };

  const isValid =
    amount &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    referenceNumber.trim().length > 2 &&
    isConfirmed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 animate-in fade-in duration-300">
      <div className="w-full h-full max-w-md bg-white overflow-y-auto flex flex-col relative">
        <div className="px-6 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2 text-green-700">
            <ShieldCheckIcon className="w-6 h-6" />
            <h2 className="text-lg font-black tracking-tight">Record Token</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 space-y-6 pb-32">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <p className="text-sm text-slate-500 font-medium">
            Recording a token payment will permanently close this lead as won. Please verify all details carefully.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Token Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-4 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="w-full pl-9 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xl text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 appearance-none"
            >
              <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Reference Number (UTR / Cheque No / Txn ID) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. UTR123456789"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 uppercase"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Date Received <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            />
          </div>

          <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="confirm-token"
              checked={isConfirmed}
              onChange={(e) => setIsConfirmed(e.target.checked)}
              className="mt-1 w-5 h-5 text-green-600 rounded border-slate-300 focus:ring-green-500"
            />
            <label
              htmlFor="confirm-token"
              className="text-sm font-semibold text-green-900 leading-snug cursor-pointer"
            >
              I confirm that I have verified the token payment receipt and understand this action will officially close the lead as won.
            </label>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 w-full md:max-w-md md:mx-auto p-6 bg-white border-t border-slate-100 z-20 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!isValid || isSubmitting}
            onClick={handleSubmit}
            className="w-full bg-green-600 text-white font-black py-4 rounded-xl disabled:bg-slate-300 disabled:text-slate-500 transition-colors uppercase tracking-wide text-sm hover:bg-green-700 shadow-sm"
          >
            {isSubmitting ? "Processing..." : "Confirm & Close Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
