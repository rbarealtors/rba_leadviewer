"use client";

import { useState } from "react";
import type { Lead } from "@/lib/leads/types";
import { formatIST } from "@/lib/time";
import { SourceBadge } from "@/app/leads/SourceBadge";
import { DispositionSheet } from "@/components/sales/DispositionSheet";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function SalesClient({ initialLeads, userName }: { initialLeads: Lead[]; userName: string }) {
  const [queue, setQueue] = useState<Lead[]>(initialLeads);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDispositionOpen, setIsDispositionOpen] = useState(false);
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const currentLead = queue[currentIndex];

  const handleSkip = () => {
    if (queue.length <= 1) return;
    setQueue((prev) => {
      const newQueue = [...prev];
      const lead = newQueue.splice(currentIndex, 1)[0];
      if (lead) newQueue.push(lead);
      return newQueue;
    });
    // Stay at same index, which now points to the next lead that slid down
  };

  const handleDispositionSuccess = () => {
    setIsDispositionOpen(false);
    setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
    // If we were at the end, wrap back to 0
    if (currentIndex >= queue.length - 1) {
      setCurrentIndex(0);
    }
  };

  if (queue.length === 0) {
    return (
      <>
        <Header userName={userName} progress="0 of 0" onSignOut={handleSignOut} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-4xl mb-4 block">🎉</span>
            <h2 className="text-xl font-bold text-slate-800">All Caught Up!</h2>
            <p className="text-slate-500 mt-2 text-sm">You have no pending leads assigned to you at the moment.</p>
          </div>
        </div>
      </>
    );
  }

  if (!currentLead) return null;

  const progress = `Lead ${currentIndex + 1} of ${queue.length}`;
  const cleanPhone = currentLead.phone_number?.replace(/^p:/i, "").trim() || "";
  const waPhone = cleanPhone.replace(/[^0-9]/g, "");
  const waUrl = waPhone ? `https://wa.me/${waPhone}` : "#";

  return (
    <>
      <Header userName={userName} progress={progress} onSignOut={handleSignOut} />

      <main className="flex-1 p-4 pb-32 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-black text-slate-900 leading-tight">
                {currentLead.full_name || "New Prospect"}
              </h1>
              <SourceBadge source={currentLead.source} />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Assigned {currentLead.assigned_at ? formatIST(currentLead.assigned_at) : "Unknown"}</span>
            </div>

            {currentLead.campaign_name && (
              <div className="flex items-center gap-1.5 text-sm text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 mt-1">
                <span>🎯</span>
                <span className="font-semibold truncate">{currentLead.campaign_name}</span>
              </div>
            )}
          </div>

          <div className="p-5 bg-slate-50 flex flex-col gap-4 flex-1">
            <div className="grid grid-cols-2 gap-3">
              <PrefPill label="BHK" value={currentLead.bhk_configuration} icon="🏠" />
              <PrefPill label="Budget" value={currentLead.budget_range} icon="💰" />
              <PrefPill label="Timeline" value={currentLead.planning_timeline} icon="⏳" className="col-span-2" />
            </div>
            {currentLead.email && (
              <div className="mt-2 text-sm text-slate-500 break-all">
                <span className="font-semibold text-slate-700 mr-2">Email:</span>
                {currentLead.email}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 p-4 pb-6 flex flex-col gap-3 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-10">
        <div className="flex items-center gap-3">
          <a
            href={`tel:${cleanPhone}`}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-sm"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            Call Now
          </a>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-[3.25rem] h-[3.25rem] bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-[0.98] shadow-sm"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
          </a>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-[0.98]"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => setIsDispositionOpen(true)}
            className="flex-[2] bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-[0.98]"
          >
            Log Outcome
          </button>
        </div>
      </div>

      <DispositionSheet
        isOpen={isDispositionOpen}
        onClose={() => setIsDispositionOpen(false)}
        leadId={currentLead.id}
        onSuccess={handleDispositionSuccess}
      />
    </>
  );
}

function Header({ userName, progress, onSignOut }: { userName: string; progress: string; onSignOut: () => void }) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">RBA Sales</span>
        <span className="text-sm font-semibold text-slate-900">{userName}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{progress}</span>
        <button onClick={onSignOut} className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        </button>
      </div>
    </header>
  );
}

function PrefPill({ label, value, icon, className = "" }: { label: string; value?: string | null; icon: string; className?: string }) {
  if (!value) return null;
  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-2.5 flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </span>
      <span className="text-sm font-semibold text-slate-800 truncate">{value}</span>
    </div>
  );
}
