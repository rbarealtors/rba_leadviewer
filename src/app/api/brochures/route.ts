import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppRole, isStaffOrAdmin } from "@/lib/auth/authorization";
import { validateRequestOrigin } from "@/lib/auth/csrf";
import {
  uploadBrochureFile,
  deleteBrochureFile,
  checkStorageCeiling,
} from "@/lib/storage/supabase-storage";
import {
  generateBrochureKey,
  normalizeProjectName,
  validatePdfBytes,
  validateTitle,
} from "@/lib/brochures/validate";
import type { BrochureSalesView, Brochure } from "@/lib/brochures/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/brochures
 * Lists brochures according to user role:
 * - Sales: Only active brochures, restricted fields (no storage_key).
 * - Staff/Admin: Active and archived brochures.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const role = getAppRole(user);
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const project = searchParams.get("project")?.trim() || "";
  const showArchived = searchParams.get("archived") === "true";

  if (role === "sales") {
    // Sales can ONLY ever view active brochures and safe fields
    let query = supabase
      .from("brochures")
      .select(
        "id, title, project_name, description, original_filename, file_size_bytes, file_uploaded_at, updated_at",
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (project) {
      if (project.toLowerCase() === "general") {
        query = query.is("project_name", null);
      } else {
        query = query.eq("project_name", project);
      }
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,project_name.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brochures: (data as BrochureSalesView[]) || [] });
  }

  // Management (Staff and Admin)
  let query = supabase
    .from("brochures")
    .select("*")
    .order("created_at", { ascending: false });

  if (showArchived) {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }

  if (project) {
    if (project.toLowerCase() === "general") {
      query = query.is("project_name", null);
    } else {
      query = query.eq("project_name", project);
    }
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,project_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brochures: (data as Brochure[]) || [] });
}

/**
 * POST /api/brochures
 * Staff/Admin only: Upload, optimize, and create a new brochure.
 *
 * Pipeline:
 * 1. Authenticate & authorize Staff/Admin
 * 2. Validate input PDF bytes (magic header, size <= 25 MB)
 * 3. Inspect and optimize PDF (downsample images, compress structure)
 * 4. Validate optimized PDF integrity
 * 5. Calculate resulting stored size and enforce 2.7 GB storage ceiling
 * 6. Store optimized PDF in private Supabase Storage
 * 7. Save brochure metadata in public.brochures
 * 8. Compensating delete if DB insert fails
 */
export async function POST(request: Request) {
  // 1. Verify Origin (CSRF)
  if (!validateRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
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
      { error: "Staff or administrator permissions required to upload brochures." },
      { status: 403 },
    );
  }

  // 4. Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data." },
      { status: 400 },
    );
  }

  const rawFile = formData.get("file");
  const rawTitle = formData.get("title");
  const rawProject = formData.get("project_name");
  const rawDescription = formData.get("description");

  // Validate file presence
  if (!rawFile || !(rawFile instanceof Blob)) {
    return NextResponse.json(
      { error: "A valid PDF file is required." },
      { status: 400 },
    );
  }

  // Validate title
  const titleValidation = validateTitle(
    typeof rawTitle === "string" ? rawTitle : null,
  );
  if (!titleValidation.valid) {
    return NextResponse.json({ error: titleValidation.error }, { status: 400 });
  }

  // Normalize project name & description
  const projectName = normalizeProjectName(
    typeof rawProject === "string" ? rawProject : null,
  );
  const description =
    typeof rawDescription === "string" && rawDescription.trim().length > 0
      ? rawDescription.trim()
      : null;

  // Extract file bytes and original filename
  const originalFilename =
    rawFile instanceof File && rawFile.name
      ? rawFile.name
      : "brochure.pdf";

  const arrayBuffer = await rawFile.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const fileSizeBytes = fileBytes.byteLength;

  // Validate PDF bytes, length (<= 25 MB), and magic header (%PDF-)
  const pdfValidation = validatePdfBytes(fileBytes);
  if (!pdfValidation.valid) {
    return NextResponse.json({ error: pdfValidation.error }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();

  // Enforce 2.7 GB storage ceiling
  try {
    const ceilingCheck = await checkStorageCeiling(adminClient, fileSizeBytes);
    if (!ceilingCheck.allowed) {
      return NextResponse.json(
        { error: ceilingCheck.error },
        { status: 400 },
      );
    }
  } catch (ceilingErr) {
    console.error("[Storage Ceiling Check Error]", ceilingErr);
    return NextResponse.json(
      { error: "Unable to verify current library storage usage." },
      { status: 500 },
    );
  }

  // Generate IDs & Immutable Storage Key
  const brochureId = crypto.randomUUID();
  const fileUuid = crypto.randomUUID();
  const storageKey = generateBrochureKey(brochureId, fileUuid);

  // Upload file to private Supabase Storage
  try {
    await uploadBrochureFile(adminClient, storageKey, fileBytes);
  } catch (storageErr: unknown) {
    console.error("[Brochures Supabase Storage Upload Error]", {
      storageKey,
      error: storageErr,
    });
    return NextResponse.json(
      {
        error:
          storageErr instanceof Error
            ? storageErr.message
            : "Could not upload file to Supabase Storage.",
      },
      { status: 500 },
    );
  }

  // Insert row into Supabase via service-role admin client
  const nowIso = new Date().toISOString();

  const { data: inserted, error: dbError } = await adminClient
    .from("brochures")
    .insert({
      id: brochureId,
      title: titleValidation.title,
      project_name: projectName,
      description,
      storage_key: storageKey,
      original_filename: originalFilename,
      mime_type: "application/pdf",
      file_size_bytes: fileSizeBytes,
      uploaded_by: user.id,
      updated_by: user.id,
      file_uploaded_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select()
    .single();

  // Compensating transaction on DB failure
  if (dbError || !inserted) {
    console.error("[Brochures DB Insert Failed] Compensating delete on storage object:", {
      storageKey,
      dbError,
    });

    try {
      await deleteBrochureFile(adminClient, storageKey);
      console.info("[Brochures Compensating Delete] Cleaned up orphaned storage object:", storageKey);
    } catch (cleanupErr) {
      console.error("[Brochures Compensating Delete Failed]", {
        storageKey,
        cleanupErr,
      });
    }

    return NextResponse.json(
      { error: "Failed to record brochure in database: " + (dbError?.message || "Unknown error") },
      { status: 500 },
    );
  }

  console.info("[Brochures Created Successfully]", {
    brochureId,
    title: inserted.title,
    projectName: inserted.project_name,
    storageKey,
    fileSizeBytes: inserted.file_size_bytes,
    uploadedBy: user.id,
  });

  return NextResponse.json({ success: true, brochure: inserted }, { status: 201 });
}
