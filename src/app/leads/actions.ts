"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/leads/validate";

/**
 * Marks a single lead viewed/unread. This is the ONLY lead mutation exposed
 * to the app. It updates exactly one column (viewed_at) on exactly one row
 * identified by id — never a full-row update, never a bulk update. The
 * database also enforces this via RLS (only the viewed_at column is
 * grantable) and a trigger that rejects changes to any other column.
 */
export async function setLeadViewed(leadId: string, viewed: boolean): Promise<{ error: string | null }> {
  if (!isValidUuid(leadId)) {
    return { error: "Invalid lead id." };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase
    .from("leads")
    .update({ viewed_at: viewed ? new Date().toISOString() : null })
    .eq("id", leadId);

  if (error) {
    return { error: "Could not update lead." };
  }

  revalidatePath("/leads");
  return { error: null };
}

/**
 * Fetches qualifying leads from the previous CRM operational day (7 PM -> 7 PM IST)
 * that have not yet been viewed (viewed_at IS NULL).
 */
export async function fetchUnseenYesterdayLeadsAction(): Promise<{ data: any[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: [], error: "Not signed in." };
  }

  const { getPreviousIstBusinessDayWindow } = await import("@/lib/time");
  const { enrichLeadsWithResolvedNames, LEADS_SELECT_FIELDS } = await import("@/lib/leads/enrich");
  const { startIso, exclusiveEndIso } = getPreviousIstBusinessDayWindow();


  const { data, error } = await supabase
    .from("leads")
    .select(LEADS_SELECT_FIELDS)
    .gte("source_submitted_at", startIso)
    .lt("source_submitted_at", exclusiveEndIso)
    .is("viewed_at", null)
    .order("source_submitted_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const enriched = await enrichLeadsWithResolvedNames(data || []);
  return { data: enriched, error: null };
}

