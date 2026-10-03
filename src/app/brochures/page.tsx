import { getMaxBrowserPdfSourceMb } from "@/lib/settings/system-settings";
import { Suspense } from "react";
import { AppHeader } from "@/app/AppHeader";
import { requireManagement } from "@/lib/auth/require-management";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin, getAppRole } from "@/lib/auth/authorization";
import { BrochuresClient } from "./BrochuresClient";
import type { Brochure } from "@/lib/brochures/types";

export const dynamic = "force-dynamic";

export default async function BrochuresPage() {
  const user = await requireManagement();
  const supabase = await createSupabaseServerClient();

  // Load initial active brochures
  const { data: brochuresData, error } = await supabase
    .from("brochures")
    .select("*")
    .order("created_at", { ascending: false });

  const brochures = (brochuresData as Brochure[]) || [];

  // Load configured maximum browser PDF processing source limit
  const maxSourceMb = await getMaxBrowserPdfSourceMb(supabase);

  // Query distinct known project names for autocomplete suggestion
  const { data: distinctProjects } = await supabase
    .from("brochures")
    .select("project_name")
    .not("project_name", "is", null);

  const knownProjects = Array.from(
    new Set(
      (distinctProjects || [])
        .map((p) => p.project_name?.trim())
        .filter((p): p is string => Boolean(p)),
    ),
  ).sort();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader
        email={user.email}
        isAdmin={isAdmin(user)}
        
      />

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            Could not load brochures. Please refresh the page.
          </div>
        ) : (
          <Suspense fallback={<div className="text-sm text-subtle py-8">Loading brochures...</div>}>
            <BrochuresClient
              initialBrochures={brochures}
              knownProjects={knownProjects}
              userRole={getAppRole(user)}
              maxSourceMb={maxSourceMb}
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}

