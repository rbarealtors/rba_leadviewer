import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { LeadDetailClient } from "@/components/sales/leads/LeadDetailClient";
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/sales/icons";
import { getLeadTimelineAction } from "../../workflow-actions";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const leadId = resolvedParams.id;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // 1. Fetch Lead
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead || (user.app_metadata?.role === "sales" && lead.assigned_to !== user.id)) {
    return notFound();
  }

  // 2. Fetch Timeline
  const { data: timelineData } = await getLeadTimelineAction(leadId);

  // 3. Fetch Visits
  const { data: visits } = await supabase
    .from("site_visits")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  // 4. Fetch Disposition History (Phase 1A)
  const { data: dispositionHistory } = await supabase
    .from("lead_disposition_history")
    .select("*")
    .eq("lead_id", leadId)
    .order("changed_at", { ascending: false });

  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      {/* Top Nav */}
      <nav className="bg-slate-900 px-4 py-3.5 flex items-center sticky top-0 z-20 shadow-sm">
        <Link
          href="/sales"
          className="text-white hover:text-slate-200 flex items-center text-sm font-semibold transition-colors"
        >
          <ChevronLeftIcon className="w-5 h-5 mr-1" />
          Back to Action Desk
        </Link>
      </nav>

      <LeadDetailClient
        lead={lead as any}
        timeline={timelineData || []}
        visits={visits || []}
        dispositionHistory={(dispositionHistory || []) as any}
      />
    </div>
  );
}

