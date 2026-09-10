"use client";

import { useState, useEffect } from "react";
import type { Lead } from "@/lib/leads/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import LeadCard from "@/components/sales/LeadCard";

interface SalesFeedProps {
  initialLeads: Lead[];
  userName: string;
}

export function SalesFeed({ initialLeads, userName }: SalesFeedProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("sales-leads-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const updatedLead = payload.new as Lead;

          setLeads((currentLeads) => {
            const exists = currentLeads.find((l) => l.id === updatedLead.id);

            if (updatedLead.lead_status === "closed") {
              return currentLeads.filter((l) => l.id !== updatedLead.id);
            }

            if (exists) {
              return currentLeads.map((l) =>
                l.id === updatedLead.id ? updatedLead : l
              );
            }
            return currentLeads;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleTransferred = (leadId: string) => {
    setLeads((current) => current.filter((l) => l.id !== leadId));
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-[#0F6E56] uppercase tracking-wider">
            RBA Sales
          </span>
          <span className="text-[14px] font-semibold text-gray-900">{userName}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[12px] font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
            {leads.length} Leads
          </span>
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-600 active:scale-95 transition-transform"
            aria-label="Sign out"
          >
            <i className="ti ti-logout text-[20px]"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-10 overflow-y-auto w-full max-w-md mx-auto">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center mt-20">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full">
              <i className="ti ti-inbox text-[40px] text-slate-300 mb-4 block"></i>
              <h2 className="text-[18px] font-bold text-gray-900">All Caught Up!</h2>
              <p className="text-slate-500 mt-2 text-[14px]">
                You have no active leads assigned to you right now. Check back later.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onTransferred={handleTransferred}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

