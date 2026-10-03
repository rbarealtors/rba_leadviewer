import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isStaffOrAdmin } from "@/lib/auth/authorization";
import { validateRequestOrigin } from "@/lib/auth/csrf";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/brochures/[id]/archive
 * Staff/Admin only. Soft archives the brochure (R2 object is retained).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Verify Origin (CSRF)
  if (!validateRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid brochure ID." }, { status: 400 });
  }

  // 2. Independently authenticate
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 3. Authorize role
  if (!isStaffOrAdmin(user)) {
    return NextResponse.json(
      { error: "Staff or administrator permissions required to archive brochures." },
      { status: 403 },
    );
  }

  // 4. Update row
  const adminClient = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await adminClient
    .from("brochures")
    .update({
      archived_at: nowIso,
      archived_by: user.id,
      updated_at: nowIso,
      updated_by: user.id,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[Brochures Archive Error]", { id, error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Brochure not found." }, { status: 404 });
  }

  console.info("[Brochures Archived]", {
    id,
    title: updated.title,
    archivedBy: user.id,
    archivedAt: nowIso,
  });

  return NextResponse.json({ success: true, brochure: updated });
}
