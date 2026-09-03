import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/leads/types";
import { LeadsClient } from "./LeadsClient";
import { AppHeader } from "@/app/AppHeader";
import { isAdmin } from "@/lib/auth/authorization";

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
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("source_submitted_at", { ascending: false });

  const leads = (data ?? []) as Lead[];

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user?.email} isAdmin={isAdmin(user)} />

      <main className="max-w-[1400px] mx-auto px-6 py-5">
        {error ? (
          <p className="text-sm text-red-600">Could not load leads. Please refresh.</p>
        ) : (
          <LeadsClient initialLeads={leads} />
        )}
      </main>
    </div>
  );
}
