"use client";

import { useState } from "react";
import type { Lead, SiteVisit, LeadActivity, LeadDispositionHistory } from "@/lib/leads/types";
import { formatDateTime } from "@/lib/date-utils";
import { PhoneIcon, CalendarIcon, MapPinIcon, ClockIcon } from "../icons";
import { LogContactSheet } from "../actions/LogContactSheet";
import { ScheduleVisitSheet } from "../actions/ScheduleVisitSheet";
import { UpdateVisitSheet } from "../actions/UpdateVisitSheet";
import { StartBookingSheet } from "../actions/StartBookingSheet";
import { RecordTokenModal } from "../actions/RecordTokenModal";
import { ManageFollowUpSheet } from "../actions/ManageFollowUpSheet";

interface LeadDetailClientProps {
  lead: Lead;
  timeline: LeadActivity[];
  visits: SiteVisit[];
  dispositionHistory?: LeadDispositionHistory[];
}

type TimelineItem =
  | {
      kind: "activity";
      id: string;
      timestamp: string;
      activity: LeadActivity;
    }
  | {
      kind: "disposition";
      id: string;
      timestamp: string;
      history: LeadDispositionHistory;
    };

export function LeadDetailClient({
  lead,
  timeline,
  visits,
  dispositionHistory = [],
}: LeadDetailClientProps) {
  const [activeSheet, setActiveSheet] = useState<
    | "contact"
    | "scheduleVisit"
    | "updateVisit"
    | "startBooking"
    | "token"
    | "followUp"
    | null
  >(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // Find next action
  const activeVisit = visits.find((v) => v.status === "scheduled");
  let nextAction = null;
  if (activeVisit) {
    nextAction = {
      type: "visit",
      text: `Site Visit on ${formatDateTime(activeVisit.scheduled_at)}`,
    };
  } else if (lead.next_follow_up) {
    nextAction = {
      type: "call",
      text: `Follow-up Call by ${formatDateTime(lead.next_follow_up)}`,
    };
  }

  const handleUpdateVisit = (visitId: string) => {
    setSelectedVisitId(visitId);
    setActiveSheet("updateVisit");
  };

  // Combine activities and disposition history into a unified chronological stream
  const timelineItems: TimelineItem[] = [
    ...timeline.map((act) => ({
      kind: "activity" as const,
      id: `act-${act.id}`,
      timestamp: act.created_at,
      activity: act,
    })),
    ...dispositionHistory.map((disp) => ({
      kind: "disposition" as const,
      id: `disp-${disp.id}`,
      timestamp: disp.changed_at,
      history: disp,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="flex flex-col min-h-full bg-slate-50 relative pb-32">
      {/* 1. Identity & Contact */}
      <header className="bg-white px-6 py-6 border-b border-slate-200">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">
              {lead.full_name}
            </h1>
            <a
              href={`tel:${lead.phone_number}`}
              className="text-lg font-semibold text-blue-600 flex items-center gap-1.5 hover:underline"
            >
              <PhoneIcon className="w-4 h-4" />
              {lead.phone_number}
            </a>
          </div>
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full uppercase tracking-wider">
            {lead.lead_stage?.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      {/* 2. Next Action Hero */}
      {nextAction && (
        <div className="px-6 -mt-3 relative z-10">
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-lg flex items-center gap-3">
            {nextAction.type === "call" ? (
              <PhoneIcon className="text-amber-400 w-5 h-5 flex-shrink-0" />
            ) : (
              <CalendarIcon className="text-purple-400 w-5 h-5 flex-shrink-0" />
            )}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Next Action
              </p>
              <p className="font-medium text-sm">{nextAction.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Follow-Up Schedule */}
      <div className="px-6 pt-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Follow-Up Call
            </p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              {lead.next_follow_up ? formatDateTime(lead.next_follow_up) : "None scheduled"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSheet("followUp")}
            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <ClockIcon className="w-3.5 h-3.5" />
            {lead.next_follow_up ? "Manage" : "Schedule"}
          </button>
        </div>
      </div>

      {/* 4. Current Context (Source & Budget) */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 gap-4 text-sm bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">
              Source
            </p>
            <p className="font-semibold text-slate-900">
              {lead.source?.replace(/_/g, " ") || "Direct"}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">
              Budget
            </p>
            <p className="font-semibold text-slate-900">{lead.budget_range || "Unknown"}</p>
          </div>
        </div>
      </div>

      {/* 5. History & Timeline (Activities + Disposition Transitions) */}
      <div className="px-6 pb-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
          History & Timeline
        </h2>
        <div className="space-y-6 pl-2 border-l-2 border-slate-200">
          {timelineItems.map((item) => {
            if (item.kind === "disposition") {
              const h = item.history;
              return (
                <div key={item.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-blue-600 rounded-full" />
                  <div className="mb-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-sm">
                        Disposition Changed
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(h.changed_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {h.old_disposition && (
                        <>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                            {h.old_disposition}
                          </span>
                          <span className="text-slate-400 text-xs font-bold">→</span>
                        </>
                      )}
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold">
                        {h.new_disposition}
                      </span>
                    </div>

                    {h.changed_by && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Updated by staff/sales
                      </p>
                    )}

                    {h.note && (
                      <p className="text-sm text-slate-600 bg-white border border-slate-100 rounded-lg p-3 mt-2 shadow-sm">
                        {h.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            const activity = item.activity;
            return (
              <div key={item.id} className="relative pl-6">
                <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-slate-400 rounded-full" />
                <div className="mb-1">
                  <span className="font-semibold text-slate-900 text-sm">{activity.title}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {formatDateTime(activity.created_at)}
                  </span>
                </div>
                {activity.description && (
                  <p className="text-sm text-slate-600 bg-white border border-slate-100 rounded-lg p-3 mt-2 shadow-sm">
                    {activity.description}
                  </p>
                )}
                {/* If it's a scheduled visit activity and the visit is still active, show update button */}
                {activity.type === "site_visit_scheduled" && activity.details?.visit_id && (
                  (() => {
                    const v = visits.find((item) => item.id === activity.details!.visit_id);
                    if (v && v.status === "scheduled") {
                      return (
                        <button
                          type="button"
                          onClick={() => handleUpdateVisit(v.id)}
                          className="mt-3 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <MapPinIcon className="w-4 h-4" />
                          Update Visit Outcome
                        </button>
                      );
                    }
                    return null;
                  })()
                )}
              </div>
            );
          })}
          {timelineItems.length === 0 && (
            <p className="text-sm text-slate-500 pl-4">No history yet.</p>
          )}
        </div>
      </div>

      {/* Primary Action Bar */}
      {lead.lead_stage !== "CLOSED" && (
        <div className="fixed bottom-0 left-0 right-0 w-full md:max-w-md md:mx-auto bg-white border-t border-slate-200 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] z-40 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] flex gap-2 md:border-x">
          {lead.lead_stage === "NEW" || lead.lead_stage === "CONTACTED" ? (
            <>
              <button
                type="button"
                onClick={() => setActiveSheet("contact")}
                className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-xl text-center active:bg-blue-700 hover:bg-blue-700 transition-colors shadow-sm"
              >
                Log Contact
              </button>
              {lead.lead_stage === "CONTACTED" && (
                <button
                  type="button"
                  onClick={() => setActiveSheet("scheduleVisit")}
                  className="flex-1 bg-purple-600 text-white font-bold py-3.5 rounded-xl text-center active:bg-purple-700 hover:bg-purple-700 transition-colors shadow-sm"
                >
                  Schedule Visit
                </button>
              )}
            </>
          ) : lead.lead_stage === "SITE_VISIT" ? (
            <>
              <button
                type="button"
                onClick={() => setActiveSheet("scheduleVisit")}
                className="flex-1 bg-slate-100 text-slate-800 font-bold py-3.5 rounded-xl text-center active:bg-slate-200 hover:bg-slate-200 border border-slate-200 transition-colors"
              >
                New Visit
              </button>
              <button
                type="button"
                onClick={() => setActiveSheet("startBooking")}
                className="flex-1 bg-teal-600 text-white font-bold py-3.5 rounded-xl text-center active:bg-teal-700 hover:bg-teal-700 transition-colors shadow-sm"
              >
                Start Booking
              </button>
            </>
          ) : lead.lead_stage === "BOOKING" ? (
            <button
              type="button"
              onClick={() => setActiveSheet("token")}
              className="flex-1 bg-green-600 text-white font-bold py-3.5 rounded-xl text-center active:bg-green-700 hover:bg-green-700 transition-colors shadow-sm"
            >
              Record Token
            </button>
          ) : null}
        </div>
      )}

      {/* Sheets & Modals */}
      {activeSheet === "contact" && (
        <LogContactSheet leadId={lead.id} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === "scheduleVisit" && (
        <ScheduleVisitSheet leadId={lead.id} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === "updateVisit" && selectedVisitId && (
        <UpdateVisitSheet visitId={selectedVisitId} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === "startBooking" && (
        <StartBookingSheet leadId={lead.id} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === "token" && (
        <RecordTokenModal leadId={lead.id} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === "followUp" && (
        <ManageFollowUpSheet
          leadId={lead.id}
          currentFollowUp={lead.next_follow_up}
          onClose={() => setActiveSheet(null)}
        />
      )}
    </div>
  );
}
