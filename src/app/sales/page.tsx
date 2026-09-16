import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { Lead } from "@/lib/leads/types";
import { formatDate, isToday } from "@/lib/date-utils";
import { PhoneIcon, ClockIcon, InboxIcon } from "@/components/sales/icons";
import PINEntryScreenClientWrapper from "./PINEntryScreenClientWrapper";

function sourceBadge(source: string | null | undefined): { label: string; cls: string } {
  switch (source) {
    case "meta_ads":
      return { label: "Meta", cls: "bg-[#EEEDFE] text-[#534AB7]" };
    case "google_ads":
      return { label: "Google", cls: "bg-[#FAC775] text-[#633806]" };
    case "phone_call":
      return { label: "Phone", cls: "bg-[#E6F1FB] text-[#185FA5]" };
    default:
      return { label: "Other", cls: "bg-slate-100 text-slate-500" };
  }
}

function ActionCard({
  lead,
  reasonLine,
  urgency,
}: {
  lead: Lead;
  reasonLine: string;
  urgency: "new" | "overdue" | "today";
}) {
  const badge = sourceBadge(lead.source);
  const stripeColor =
    urgency === "overdue"
      ? "bg-red-500"
      : urgency === "today"
        ? "bg-amber-400"
        : "bg-emerald-500";

  return (
    <Link
      href={`/sales/leads/${lead.id}`}
      className="block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className={`h-1 w-full ${stripeColor}`} />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[14px] text-slate-900 truncate leading-snug">
            {lead.full_name || "New Prospect"}
          </p>
          <p
            className={`text-[11px] font-medium mt-0.5 ${
              urgency === "overdue"
                ? "text-red-600"
                : urgency === "today"
                  ? "text-amber-700"
                  : "text-slate-500"
            }`}
          >
            {reasonLine}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
          <PhoneIcon className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({
  label,
  count,
  urgency,
}: {
  label: string;
  count: number;
  urgency: "new" | "overdue" | "today";
}) {
  const dotColor =
    urgency === "overdue"
      ? "bg-red-500 animate-pulse"
      : urgency === "today"
        ? "bg-amber-400"
        : "bg-emerald-500";
  const textColor =
    urgency === "overdue"
      ? "text-red-600"
      : urgency === "today"
        ? "text-amber-700"
        : "text-emerald-700";

  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h2 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${textColor}`}>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </h2>
      <span className="text-[11px] text-slate-400 font-medium">{count}</span>
    </div>
  );
}

export default async function SalesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = user.app_metadata?.role;
  const cookieStore = await cookies();
  const isPinVerified = cookieStore.has("sales_pin_verified");

  if (role === "sales" && !isPinVerified) {
    return <PINEntryScreenClientWrapper />;
  }

  const { data: rawNew } = await supabase
    .from("leads")
    .select("id, full_name, source, assigned_at")
    .eq("assigned_to", user.id)
    .eq("lead_stage", "NEW")
    .neq("lead_status", "closed")
    .order("assigned_at", { ascending: false });

  const { data: rawFollowUps } = await supabase
    .from("leads")
    .select("id, full_name, source, next_follow_up")
    .eq("assigned_to", user.id)
    .neq("lead_status", "closed")
    .not("next_follow_up", "is", null)
    .order("next_follow_up", { ascending: true });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const overdue: Lead[] = [];
  const dueToday: Lead[] = [];

  for (const lead of (rawFollowUps || []) as Lead[]) {
    if (!lead.next_follow_up) continue;
    const d = new Date(lead.next_follow_up);
    if (d < todayStart) {
      overdue.push(lead);
    } else if (isToday(d)) {
      dueToday.push(lead);
    }
  }

  const newLeads = (rawNew || []) as Lead[];
  const totalItems = newLeads.length + overdue.length + dueToday.length;
  const userName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "Sales Rep";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-28">
      <header className="bg-slate-900 text-white px-5 py-4 sticky top-0 z-20 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">
              RBA Sales
            </p>
            <h1 className="text-[16px] font-bold tracking-tight leading-none">
              {userName}
            </h1>
          </div>
          <Link
            href="/sales/settings"
            aria-label="Settings"
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full flex items-center justify-center text-slate-100 font-bold text-[13px] transition-colors"
          >
            {userInitial}
          </Link>
        </div>
      </header>

      <div className="p-4 flex flex-col gap-6">
        {totalItems === 0 ? (
          <div className="py-24 flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl mx-auto flex items-center justify-center mb-4 border border-emerald-100">
              <InboxIcon className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="text-[15px] font-bold text-slate-900 mb-1">All Caught Up</h3>
            <p className="text-slate-400 text-xs max-w-[220px]">
              No new leads or pending follow-ups right now. Check your Pipeline for the full view.
            </p>
          </div>
        ) : (
          <>
            {newLeads.length > 0 && (
              <section>
                <SectionHeader label="New Leads" count={newLeads.length} urgency="new" />
                <div className="flex flex-col gap-2">
                  {newLeads.map((lead) => (
                    <ActionCard
                      key={lead.id}
                      lead={lead}
                      reasonLine="New lead — needs first call"
                      urgency="new"
                    />
                  ))}
                </div>
              </section>
            )}

            {overdue.length > 0 && (
              <section>
                <SectionHeader label="Overdue Follow-Ups" count={overdue.length} urgency="overdue" />
                <div className="flex flex-col gap-2">
                  {overdue.map((lead) => (
                    <ActionCard
                      key={lead.id}
                      lead={lead}
                      reasonLine={`Overdue since ${formatDate(lead.next_follow_up!)}`}
                      urgency="overdue"
                    />
                  ))}
                </div>
              </section>
            )}

            {dueToday.length > 0 && (
              <section>
                <SectionHeader label="Follow-Ups Today" count={dueToday.length} urgency="today" />
                <div className="flex flex-col gap-2">
                  {dueToday.map((lead) => (
                    <ActionCard
                      key={lead.id}
                      lead={lead}
                      reasonLine="Follow-up due today"
                      urgency="today"
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {totalItems > 0 && (
          <p className="text-center text-[11px] text-slate-400 pb-2 flex items-center justify-center gap-1">
            <ClockIcon className="w-3.5 h-3.5" />
            See all follow-ups in the Follow-Ups tab
          </p>
        )}
      </div>
    </div>
  );
}
