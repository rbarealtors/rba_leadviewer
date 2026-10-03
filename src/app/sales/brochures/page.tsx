import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SalesBrochuresClient } from "./SalesBrochuresClient";
import type { BrochureSalesView } from "@/lib/brochures/types";

export const dynamic = "force-dynamic";

export default async function SalesBrochuresPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Sales can ONLY ever view active brochures.
  // Explicitly select only client-safe columns (never select storage_key).
  const { data: brochuresData, error } = await supabase
    .from("brochures")
    .select(
      "id, title, project_name, description, original_filename, file_size_bytes, file_uploaded_at, updated_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const brochures = (brochuresData as BrochureSalesView[]) || [];

  const userName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "Sales Rep";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <SalesBrochuresClient
      initialBrochures={brochures}
      loadError={Boolean(error)}
      userName={userName}
      userInitial={userInitial}
    />
  );
}
