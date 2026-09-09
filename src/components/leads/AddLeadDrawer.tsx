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
    notes: ""
  });

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
        notes: ""
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
          notes: formData.notes.trim() || null
        }
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

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/30 z-[40]" 
        onClick={onClose} 
      />
      <div className="fixed inset-y-0 right-0 max-w-md w-full bg-white dark:bg-zinc-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Add Lead</h2>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="add-lead-form" onSubmit={handleSubmit} className="space-y-5 text-sm">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
            
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.phoneNumber}
                onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Source <span className="text-red-500">*</span>
              </label>
              <select
                required
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.source}
                onChange={e => setFormData({ ...formData, source: e.target.value })}
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
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Campaign / Project
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.campaignName}
                onChange={e => setFormData({ ...formData, campaignName: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Budget Range
              </label>
              <select
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.budgetRange}
                onChange={e => setFormData({ ...formData, budgetRange: e.target.value })}
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
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                BHK Configuration
              </label>
              <select
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.bhk}
                onChange={e => setFormData({ ...formData, bhk: e.target.value })}
              >
                <option value="">Select BHK</option>
                <option value="1 BHK">1 BHK</option>
                <option value="2 BHK">2 BHK</option>
                <option value="3 BHK">3 BHK</option>
                <option value="Commercial">Commercial</option>
                <option value="Plot">Plot</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Planning Timeline
              </label>
              <select
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.timeline}
                onChange={e => setFormData({ ...formData, timeline: e.target.value })}
              >
                <option value="">Select Timeline</option>
                <option value="Immediately">Immediately</option>
                <option value="Within 1 month">Within 1 month</option>
                <option value="Within 3 months">Within 3 months</option>
                <option value="Just browsing">Just browsing</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Notes / Remarks
              </label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </form>
        </div>

        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              form="add-lead-form"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              Submit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
