import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LeadsClient } from "./LeadsClient";
import { AppHeader } from "@/app/AppHeader";
import { isAdmin } from "@/lib/auth/authorization";
import { enrichLeadsWithResolvedNames, LEADS_SELECT_FIELDS } from "@/lib/leads/enrich";
import { getPreviousIstBusinessDayWindow } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login before
  // this ever renders, but we guard again here since this is also where
  // the actual data fetch happens and RLS is the real boundary, not this
  // check.
  const query = supabase
    .from("leads")
    .select(LEADS_SELECT_FIELDS)
    .order("source_submitted_at", { ascending: false })
    .range(0, 49);

  const kpisQuery = supabase.rpc("get_lead_kpis");

  const { startIso: prevStartIso, exclusiveEndIso: prevEndIso } = getPreviousIstBusinessDayWindow();
  const unseenYesterdayQuery = supabase
    .from("leads")
    .select(LEADS_SELECT_FIELDS)
    .gte("source_submitted_at", prevStartIso)
    .lt("source_submitted_at", prevEndIso)
    .is("viewed_at", null)
    .order("source_submitted_at", { ascending: false });

  const [leadsResponse, kpisResponse, unseenResponse] = await Promise.all([
    query,
    kpisQuery,
    unseenYesterdayQuery,
  ]);
  const { data, error } = leadsResponse;

  const kpiData = Array.isArray(kpisResponse.data) ? kpisResponse.data[0] : kpisResponse.data;
  const kpiCounts = (kpiData as any) || {
    total: 0,
    new_count: 0,
    viewed_count: 0,
  };

  const totalCount = kpiCounts.total ?? kpiCounts.total_count ?? 0;

  const rawLeads = (data ?? []) as any[];
  const rawUnseen = (unseenResponse.data ?? []) as any[];

  const [leads, unseenYesterdayLeads] = await Promise.all([
    enrichLeadsWithResolvedNames(rawLeads),
    enrichLeadsWithResolvedNames(rawUnseen),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user?.email} isAdmin={isAdmin(user)} />

      <main className="max-w-[1400px] mx-auto px-6 py-5">
        {error ? (
          <p className="text-sm text-red-600">Could not load leads. Please refresh.</p>
        ) : (
          <LeadsClient
            initialLeads={leads}
            initialUnseenYesterdayLeads={unseenYesterdayLeads}
            kpiCounts={kpiCounts}
            totalCount={totalCount}
            userRole={user?.app_metadata?.role || "staff"}
          />
        )}
      </main>
    </div>
  );
}
