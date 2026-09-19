import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDateTime, formatDate, isToday } from "@/lib/date-utils";
import { ClockIcon, PhoneIcon } from "@/components/sales/icons";
import type { Lead } from "@/lib/leads/types";

export default async function FollowUpsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch leads assigned to current sales rep that have a scheduled next_follow_up and are not closed
  const { data: rawLeads } = await supabase
    .from("leads")
    .select("id, full_name, phone_number, lead_stage, next_follow_up, assigned_at, source")
    .eq("assigned_to", user.id)
    .neq("lead_status", "closed")
    .not("next_follow_up", "is", null)
    .order("next_follow_up", { ascending: true }); // Most overdue first

  const leads = (rawLeads || []) as Lead[];

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const overdue: Lead[] = [];
  const dueToday: Lead[] = [];
  const upcoming: Lead[] = [];

  for (const lead of leads) {
    if (!lead.next_follow_up) continue;
    const d = new Date(lead.next_follow_up);
    if (d < todayStart) {
      overdue.push(lead);
    } else if (isToday(d)) {
      dueToday.push(lead);
    } else {
      upcoming.push(lead);
    }
  }

  const FollowUpCard = ({
    lead,
    variant,
  }: {
    lead: Lead;
    variant: "overdue" | "today" | "upcoming";
  }) => {
    const borderColor =
      variant === "overdue"
        ? "border-red-100 hover:border-red-200"
        : variant === "today"
          ? "border-amber-100 hover:border-amber-200"
          : "border-slate-100 hover:border-slate-200";

    const stripeColor =
      variant === "overdue"
        ? "bg-red-500"
        : variant === "today"
          ? "bg-amber-400"
          : "bg-blue-500";

    const badgeStyle =
      variant === "overdue"
        ? "bg-red-50 text-red-700"
        : variant === "today"
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-700";

    return (
      <Link
        href={`/sales/leads/${lead.id}`}
        className={`block bg-white p-4 border rounded-xl shadow-sm relative overflow-hidden transition-colors ${borderColor}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />
        <div className="flex justify-between items-start mb-1.5 pl-1">
          <div>
            <span className="font-semibold text-slate-900 text-base">{lead.full_name}</span>
            {lead.phone_number && (
              <p className="text-xs text-slate-500 mt-0.5">{lead.phone_number}</p>
            )}
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badgeStyle}`}>
            {variant === "overdue"
              ? `OVERDUE (${formatDate(lead.next_follow_up!)})`
              : variant === "today"
                ? `TODAY · ${formatDateTime(lead.next_follow_up!).split(",")[1]?.trim() || ""}`
                : formatDate(lead.next_follow_up!)}
          </span>
        </div>

        <div className="flex justify-between items-center text-xs text-slate-500 mt-2 pl-1 pt-1.5 border-t border-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 px-2 py-0.5 bg-slate-100 rounded text-[10px] uppercase tracking-wider">
              {lead.lead_stage?.replace(/_/g, " ") || "NEW"}
            </span>
            {lead.source && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-400 capitalize">
                  {lead.source.replace(/_/g, " ")}
                </span>
              </>
            )}
          </div>
          <span className="text-blue-600 font-semibold flex items-center gap-1">
            <PhoneIcon className="w-3.5 h-3.5" />
            Open Lead
          </span>
        </div>
      </Link>
    );
  };

  const totalFollowUps = overdue.length + dueToday.length + upcoming.length;

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-28">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Follow-Ups</h1>
            <p className="text-slate-400 text-xs font-medium mt-0.5">
              {overdue.length > 0
                ? `${overdue.length} overdue · ${dueToday.length} today`
                : `${dueToday.length} due today · ${upcoming.length} upcoming`}
            </p>
          </div>
          <div className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center text-slate-300">
            <ClockIcon className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      </header>

      <div className="p-6 space-y-8 pb-10">
        {/* 1. Overdue Section */}
        {overdue.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Overdue ({overdue.length})
              </h2>
              <span className="text-[11px] text-red-500 font-semibold">Most overdue first</span>
            </div>
            <div className="space-y-3">
              {overdue.map((lead) => (
                <FollowUpCard key={lead.id} lead={lead} variant="overdue" />
              ))}
            </div>
          </section>
        )}

        {/* 2. Due Today Section */}
        {dueToday.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Due Today ({dueToday.length})
              </h2>
            </div>
            <div className="space-y-3">
              {dueToday.map((lead) => (
                <FollowUpCard key={lead.id} lead={lead} variant="today" />
              ))}
            </div>
          </section>
        )}

        {/* 3. Upcoming Section */}
        {upcoming.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Upcoming ({upcoming.length})
              </h2>
            </div>
            <div className="space-y-3">
              {upcoming.map((lead) => (
                <FollowUpCard key={lead.id} lead={lead} variant="upcoming" />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {totalFollowUps === 0 && (
          <div className="py-20 text-center px-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl mx-auto flex items-center justify-center mb-3 border border-amber-100">
              <ClockIcon className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No Pending Follow-Ups</h3>
            <p className="text-slate-500 text-xs max-w-xs mx-auto">
              You do not have any follow-up calls scheduled right now. Check your pipeline or new leads.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
