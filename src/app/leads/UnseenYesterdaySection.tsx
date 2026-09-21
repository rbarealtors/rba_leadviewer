"use client";

import type { Lead } from "@/lib/leads/types";
import { formatLeadDateTime } from "@/lib/time";
import { formatCampaignName } from "@/lib/leads/formatters";
import { SourceBadge } from "./SourceBadge";
import { PhoneCell } from "./PhoneCell";

interface UnseenYesterdaySectionProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onToggleViewed: (lead: Lead) => void;
}

export function UnseenYesterdaySection({
  leads,
  onSelectLead,
  onToggleViewed,
}: UnseenYesterdaySectionProps) {
  if (!leads || leads.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Unseen leads from yesterday alert"
      className="bg-rose-50/70 border border-rose-200 rounded-xl overflow-hidden shadow-2xs transition-all duration-300"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-rose-100/60 border-b border-rose-200/80">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <h2 className="text-sm font-bold text-rose-950">
            Unseen from Yesterday · {leads.length}
          </h2>
        </div>
        <p className="text-xs text-rose-800/90 mt-0.5 font-normal">
          These leads arrived during the previous CRM day and haven&#39;t been viewed yet.
        </p>
      </div>

      {/* Rows list / table */}
      <div
        className={`overflow-x-auto ${
          leads.length > 5 ? "max-h-[360px] overflow-y-auto" : ""
        }`}
      >
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-rose-200/70 text-[11px] font-semibold text-rose-900/70 uppercase tracking-wider bg-rose-50/50">
              <th className="py-2 px-4 whitespace-nowrap">Time (IST)</th>
              <th className="py-2 px-3 whitespace-nowrap">Source</th>
              <th className="py-2 px-3 whitespace-nowrap">Name</th>
              <th className="py-2 px-3 whitespace-nowrap">Phone & Actions</th>
              <th className="py-2 px-3 whitespace-nowrap">Campaign</th>
              <th className="py-2 px-4 text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-200/60">
            {leads.map((lead) => {
              const { dateStr, timeStr } = formatLeadDateTime(lead.source_submitted_at);
              const campaign = formatCampaignName(lead.campaign_name);

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-rose-100/50 cursor-pointer transition-colors select-none"
                  title="Click to view details in drawer"
                >
                  {/* Time */}
                  <td className="py-2.5 px-4 whitespace-nowrap text-ink">
                    <div className="flex flex-col">
                      <span className="font-semibold">{dateStr}</span>
                      <span className="text-[11px] text-rose-900/70">{timeStr}</span>
                    </div>
                  </td>

                  {/* Source Badge */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <SourceBadge source={lead.source} platform={lead.platform} />
                  </td>

                  {/* Name & Email */}
                  <td className="py-2.5 px-3 text-ink max-w-[180px]">
                    <div className="flex flex-col">
                      <span className="font-bold truncate">
                        {lead.full_name || "—"}
                      </span>
                      {lead.email && (
                        <span className="text-[11px] text-rose-900/60 truncate" title={lead.email}>
                          {lead.email}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Phone & Actions */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <PhoneCell
                      phone={lead.phone_number}
                      fullName={lead.full_name}
                      campaignName={lead.campaign_name}
                    />
                  </td>

                  {/* Campaign */}
                  <td className="py-2.5 px-3 text-ink max-w-[200px]">
                    <div className="flex flex-col">
                      <span className="font-medium truncate" title={campaign.title}>
                        {campaign.title}
                      </span>
                      {lead.ad_group_name && lead.ad_group_name !== "—" && (
                        <span className="text-[10px] text-rose-900/60 truncate" title={lead.ad_group_name}>
                          ↳ {lead.ad_group_name}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Mark Viewed Action */}
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleViewed(lead);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white border border-rose-300 text-rose-900 hover:bg-rose-50 hover:border-rose-400 shadow-2xs transition-colors shrink-0"
                      title="Mark lead as viewed"
                    >
                      <svg className="w-3.5 h-3.5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Mark viewed</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

