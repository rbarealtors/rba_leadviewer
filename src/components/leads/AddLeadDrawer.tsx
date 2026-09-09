"use client";

import { useState, FormEvent, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Lead } from "@/lib/leads/types";

interface AddLeadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadAdded?: (newLead: Lead) => void;
}

export function AddLeadDrawer({ isOpen, onClose, onLeadAdded }: AddLeadDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phoneNumber: "",
    email: "",
    source: "direct_walk_in",
    campaignName: "",
    budgetRange: "",
    bhk: "",
    timeline: "",
    notes: "",
  });

  // Lock background body scroll when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close drawer on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        fullName: "",
        phoneNumber: "",
        email: "",
        source: "direct_walk_in",
        campaignName: "",
        budgetRange: "",
        bhk: "",
        timeline: "",
        notes: "",
      });
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let formattedPhone = formData.phoneNumber.trim();
    if (formattedPhone.length === 10 && /^[0-9]{10}$/.test(formattedPhone)) {
      formattedPhone = "+91" + formattedPhone;
    }

    try {
      const supabase = createSupabaseBrowserClient();

      const newRecord = {
        external_lead_id: `manual_${crypto.randomUUID()}`,
        full_name: formData.fullName.trim(),
        phone_number: formattedPhone,
        email: formData.email.trim() || null,
        source: formData.source,
        campaign_name: formData.campaignName.trim() || null,
        budget_range: formData.budgetRange || null,
        bhk_configuration: formData.bhk || null,
        planning_timeline: formData.timeline || null,
        source_submitted_at: new Date().toISOString(),
        viewed_at: new Date().toISOString(),
        raw_payload: {
          entry_type: "manual",
          notes: formData.notes.trim() || null,
        },
      };

      const { data, error: sbError } = await supabase
        .from("leads")
        .insert(newRecord)
        .select()
        .single();

      if (sbError) throw sbError;

      if (onLeadAdded && data) {
        onLeadAdded(data as Lead);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add lead.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";
  const labelClass = "text-xs font-semibold text-gray-700 tracking-wide uppercase mb-1.5 block";
  const sectionClass = "bg-gray-50/75 border border-gray-100 rounded-xl p-4 space-y-4";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add New Lead</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manually record a direct walk-in, phone inquiry, or referral lead.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
            title="Close (Esc)"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form id="add-lead-form" onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Contact Details */}
            <div className={sectionClass}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Contact Details
              </h3>

              <div>
                <label className={labelClass}>
                  Full Name <span className="text-red-500 normal-case">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  className={inputClass}
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Phone Number <span className="text-red-500 normal-case">*</span>
                </label>
                <input
                  required
                  type="tel"
                  placeholder="e.g. 9876543210"
                  className={inputClass}
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                />
                <p className="text-[11px] text-gray-500 mt-1">10-digit Indian numbers will automatically be prefixed with +91.</p>
              </div>

              <div>
                <label className={labelClass}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  className={inputClass}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            {/* Section 2: Source & Campaign */}
            <div className={sectionClass}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Source & Campaign
              </h3>

              <div>
                <label className={labelClass}>
                  Source <span className="text-red-500 normal-case">*</span>
                </label>
                <select
                  required
                  className={inputClass}
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                >
                  <option value="direct_walk_in">Direct Walk-in</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="referral">Referral</option>
                  <option value="meta_ads">Meta Ads</option>
                  <option value="google_ads">Google Ads</option>
                  <option value="99acres">99acres</option>
                  <option value="magicbricks">MagicBricks</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Campaign / Project
                </label>
                <input
                  type="text"
                  placeholder="e.g. Godrej Horizon, Sector 150"
                  className={inputClass}
                  value={formData.campaignName}
                  onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                />
              </div>
            </div>

            {/* Section 3: Requirements & Preference */}
            <div className={sectionClass}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Requirements & Preference
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Budget Range
                  </label>
                  <select
                    className={inputClass}
                    value={formData.budgetRange}
                    onChange={(e) => setFormData({ ...formData, budgetRange: e.target.value })}
                  >
                    <option value="">Select Budget</option>
                    <option value="< 30 Lakh">&lt; 30 Lakh</option>
                    <option value="30 - 50 Lakh">30 - 50 Lakh</option>
                    <option value="50 - 70 Lakh">50 - 70 Lakh</option>
                    <option value="70 Lakh - 1 Cr">70 Lakh - 1 Cr</option>
                    <option value="> 1 Cr">&gt; 1 Cr</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    BHK Configuration
                  </label>
                  <select
                    className={inputClass}
                    value={formData.bhk}
                    onChange={(e) => setFormData({ ...formData, bhk: e.target.value })}
                  >
                    <option value="">Select BHK</option>
                    <option value="1 BHK">1 BHK</option>
                    <option value="2 BHK">2 BHK</option>
                    <option value="3 BHK">3 BHK</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Plot">Plot</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Planning Timeline
                </label>
                <select
                  className={inputClass}
                  value={formData.timeline}
                  onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                >
                  <option value="">Select Timeline</option>
                  <option value="Immediately">Immediately</option>
                  <option value="Within 1 month">Within 1 month</option>
                  <option value="Within 3 months">Within 3 months</option>
                  <option value="Just browsing">Just browsing</option>
                </select>
              </div>
            </div>

            {/* Section 4: Notes / Remarks */}
            <div className={sectionClass}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Notes & Remarks
              </h3>

              <div>
                <label className={labelClass}>
                  Internal Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add any specific client requirements, comments, or follow-up notes..."
                  className={`${inputClass} resize-none`}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Action Footer */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            form="add-lead-form"
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSubmitting && (
              <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <span>{isSubmitting ? "Adding Lead..." : "Add Lead"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
