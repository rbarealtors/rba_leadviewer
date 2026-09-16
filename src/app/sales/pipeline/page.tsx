import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate } from "@/lib/date-utils";
import { PipelineFilterControl } from "@/components/sales/pipeline/PipelineFilterControl";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const resolvedParams = await searchParams;
  const currentStageFilter = resolvedParams.stage || "ALL";
  const searchQuery = resolvedParams.q || "";

  let query = supabase
    .from("leads")
    .select("id, full_name, lead_stage, assigned_at, next_follow_up")
    .eq("assigned_to", user.id)
    .order("assigned_at", { ascending: false });

  if (currentStageFilter !== "ALL") {
    query = query.eq("lead_stage", currentStageFilter);
  }

  if (searchQuery) {
    query = query.ilike("full_name", `%${searchQuery}%`);
  }

  const { data: leads } = await query;

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-28">
      <header className="bg-slate-900 text-white px-6 py-4 sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight mb-3">Pipeline</h1>

        {/* Search */}
        <form className="mb-3" method="GET" action="/sales/pipeline">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search leads by name..."
            className="w-full bg-slate-800 border border-slate-700/50 text-white placeholder:text-slate-400 rounded-lg px-4 py-2 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
          {currentStageFilter !== "ALL" && (
            <input type="hidden" name="stage" value={currentStageFilter} />
          )}
        </form>

        {/* Compact Stage Filter Control */}
        <PipelineFilterControl
          currentStage={currentStageFilter}
          searchQuery={searchQuery}
        />
      </header>

      <div className="p-6">
        <div className="divide-y divide-slate-100 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {leads && leads.length > 0 ? (
            leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/sales/leads/${lead.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-slate-900">{lead.full_name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {lead.next_follow_up
                      ? `Follow up: ${formatDate(lead.next_follow_up)}`
                      : `Assigned: ${formatDate(lead.assigned_at)}`}
                  </p>
                </div>
                <div className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider">
                  {lead.lead_stage?.replace("_", " ")}
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm">
              No leads found in this view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
