import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate, formatTime, isToday, isFuture, isPast } from "@/lib/date-utils";

export default async function VisitsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: visits } = await supabase
    .from("site_visits")
    .select("*, lead:lead_id(full_name)")
    .eq("assigned_to", user.id)
    .order("scheduled_at", { ascending: true });

  const todayVisits =
    visits?.filter(
      (v) => v.status === "scheduled" && isToday(v.scheduled_at)
    ) || [];

  const upcomingVisits =
    visits?.filter(
      (v) => v.status === "scheduled" && isFuture(v.scheduled_at) && !isToday(v.scheduled_at)
    ) || [];

  const pastVisits =
    visits
      ?.filter(
        (v) => v.status !== "scheduled" || (isPast(v.scheduled_at) && !isToday(v.scheduled_at))
      )
      .sort(
        (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
      ) || [];

  const VisitCard = ({ visit, showStatus = false }: { visit: any; showStatus?: boolean }) => (
    <Link
      href={`/sales/leads/${visit.lead_id}`}
      className="block bg-white p-4 border border-slate-100 rounded-xl shadow-sm mb-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
    >
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-slate-900">{visit.lead?.full_name || "Client"}</span>
        {showStatus ? (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
              visit.status === "completed"
                ? "bg-green-50 text-green-700"
                : visit.status === "cancelled"
                  ? "bg-red-50 text-red-700"
                  : visit.status === "rescheduled"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-600"
            }`}
          >
            {visit.status}
          </span>
        ) : (
          <span className="text-sm font-semibold text-purple-700">
            {formatTime(visit.scheduled_at)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 mt-2 text-sm text-slate-500">
        <span>{formatDate(visit.scheduled_at)}</span>
        <span className="truncate">{visit.location || visit.property_name || "Location TBD"}</span>
      </div>
    </Link>
  );

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-28">
      <header className="bg-slate-900 text-white px-6 py-5 sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Site Visits</h1>
      </header>

      <div className="p-6 space-y-8 pb-10">
        {todayVisits.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
              Today
            </h2>
            {todayVisits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </section>
        )}

        {upcomingVisits.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
              Upcoming
            </h2>
            {upcomingVisits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </section>
        )}

        {pastVisits.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
              History
            </h2>
            {pastVisits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} showStatus={true} />
            ))}
          </section>
        )}

        {todayVisits.length === 0 && upcomingVisits.length === 0 && pastVisits.length === 0 && (
          <div className="py-20 text-center">
            <h3 className="text-lg font-medium text-slate-900 mb-1">No site visits</h3>
            <p className="text-slate-500 text-sm">You haven&apos;t scheduled any visits yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
