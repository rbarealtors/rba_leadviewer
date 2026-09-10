"use client";

import { useState, useEffect } from "react";
import type { Lead } from "@/lib/leads/types";
import { fetchSalesReps } from "@/app/sales/sales-actions";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onSuccess: () => void;
}

export default function TransferModal({ isOpen, onClose, lead, onSuccess }: TransferModalProps) {
  const [salesReps, setSalesReps] = useState<{ id: string; name: string }[]>([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  useEffect(() => {
    if (isOpen) {
      fetchSalesReps().then(setSalesReps);
    } else {
      setSelectedRep("");
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTransfer = async () => {
    if (!selectedRep) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/leads/${lead.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: selectedRep }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || "Transfer failed");
      }
    } catch (error) {
      setErrorMsg("Transfer failed. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  const cleanPhone = lead.phone_number?.replace(/^p:/i, "").trim() || "No phone";
  const displayName = lead.full_name || "New Prospect";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div 
        className="w-full max-w-[400px] bg-white rounded-xl shadow-lg p-6 space-y-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-medium text-gray-900 leading-tight">Transfer lead</h2>
        
        <div className="text-[13px] text-slate-500">
          <p>Lead: {displayName} (+{cleanPhone})</p>
        </div>

        <div className="space-y-1">
          <label className="block text-[13px] text-slate-500 font-medium">Transfer to:</label>
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            disabled={loading || salesReps.length === 0}
            className="w-full h-10 border border-slate-200 rounded-lg px-3 text-[14px] text-gray-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Select a sales rep...</option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
          {salesReps.length === 0 && <p className="text-xs text-slate-400 mt-1">Loading agents...</p>}
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex gap-2">
          <i className="ti ti-alert-triangle text-amber-600 shrink-0 mt-0.5"></i>
          <p className="text-[13px] text-amber-800">
            Are you sure you want to transfer this lead? You will lose access once it's reassigned.
          </p>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-lg font-medium text-[14px] text-slate-600 hover:bg-slate-50 border border-transparent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={loading || !selectedRep}
            className="flex-1 h-10 rounded-lg font-medium text-[14px] text-white bg-[#0F6E56] hover:bg-[#0d5d49] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

