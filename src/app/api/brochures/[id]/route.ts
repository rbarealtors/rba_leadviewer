import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isStaffOrAdmin } from "@/lib/auth/authorization";
import { validateRequestOrigin } from "@/lib/auth/csrf";
import { normalizeProjectName, validateTitle } from "@/lib/brochures/validate";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PUT /api/brochures/[id]
 * Metadata Edit (Staff/Admin only).
 * Whitelisted fields: title, project_name, description.
 * Optimistic concurrency enforced using `updated_at`.
 */
export async function PUT(
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

  // 3. Authorize role (Staff/Admin only)
  if (!isStaffOrAdmin(user)) {
    return NextResponse.json(
      { error: "Staff or administrator permissions required." },
      { status: 403 },
    );
  }

  // 4. Parse JSON payload
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { title: rawTitle, project_name: rawProject, description: rawDesc, updated_at: clientUpdatedAt } = body;

  if (typeof clientUpdatedAt !== "string" || !clientUpdatedAt) {
    return NextResponse.json(
      { error: "Missing 'updated_at' timestamp required for optimistic concurrency control." },
      { status: 400 },
    );
  }

  // Whitelist & validate allowed fields
  const titleValidation = validateTitle(
    typeof rawTitle === "string" ? rawTitle : null,
  );
  if (!titleValidation.valid) {
    return NextResponse.json({ error: titleValidation.error }, { status: 400 });
  }

  const projectName = normalizeProjectName(
    typeof rawProject === "string" ? rawProject : null,
  );
  const description =
    typeof rawDesc === "string" && rawDesc.trim().length > 0
      ? rawDesc.trim()
      : null;

  // 5. Update brochure row with optimistic concurrency check
  const adminClient = createSupabaseAdminClient();
  const newUpdatedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await adminClient
    .from("brochures")
    .update({
      title: titleValidation.title,
      project_name: projectName,
      description,
      updated_by: user.id,
      updated_at: newUpdatedAt,
    })
    .eq("id", id)
    .eq("updated_at", clientUpdatedAt)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error("[Brochures Metadata Edit Error]", { id, error: updateError });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If no rows were updated, determine if it's a 404 or a 409 Conflict
  if (!updated) {
    const { data: current } = await adminClient
      .from("brochures")
      .select("id, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return NextResponse.json({ error: "Brochure not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        error: "This brochure has been updated by another user. Please refresh and try again.",
        conflict: true,
      },
      { status: 409 },
    );
  }

  console.info("[Brochures Metadata Updated]", {
    id,
    title: updated.title,
    projectName: updated.project_name,
    updatedBy: user.id,
    previousUpdatedAt: clientUpdatedAt,
    newUpdatedAt,
  });

  return NextResponse.json({ success: true, brochure: updated });
}
