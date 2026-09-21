import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/authorization";
import { AppHeader } from "@/app/AppHeader";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function LeadImportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user)) {
    redirect("/leads");
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <AppHeader email={user.email} isAdmin={true} />

      <main className="max-w-[1400px] w-full mx-auto px-6 py-8 flex-1 flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle mb-1">
            <span>Leads</span>
            <span>/</span>
            <span className="text-accent">Import</span>
          </div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Meta Lead Ads CSV Import</h1>
          <p className="text-subtle text-sm mt-1">
            Safely recover and ingest Meta leads into the CRM with automated deduplication and attribution preservation.
          </p>
        </div>

        <ImportClient />
      </main>
    </div>
  );
}

