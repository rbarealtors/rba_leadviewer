import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isStaffOrAdmin } from "@/lib/auth/authorization";
import { validateRequestOrigin } from "@/lib/auth/csrf";
import {
  uploadBrochureFile,
  deleteBrochureFile,
  checkStorageCeiling,
} from "@/lib/storage/supabase-storage";
import {
  generateBrochureKey,
  validatePdfBytes,
} from "@/lib/brochures/validate";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PUT /api/brochures/[id]/file
 * Replace File (Staff/Admin only).
 *
 * Flow:
 * 1. Authenticate Staff/Admin.
 * 2. Read current brochure metadata.
 * 3. Receive replacement PDF.
 * 4. Validate PDF bytes.
 * 5. Optimize PDF (downsample images, compress structure).
 * 6. Validate optimized output.
 * 7. Calculate resulting total storage: current total - existing file size + optimized replacement size.
 * 8. Reject if above 2.7 GB.
 * 9. Upload optimized replacement to new immutable storage key: brochures/{id}/{newUuid}.pdf
 * 10. Compare-and-swap DB update: WHERE id = id AND storage_key = oldStorageKey
 * 11. If DB update fails/conflicts, delete new object and return 409 Conflict.
 * 12. If DB update succeeds, delete the old object.
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

  // 3. Authorize role
  if (!isStaffOrAdmin(user)) {
    return NextResponse.json(
      { error: "Staff or administrator permissions required to replace files." },
      { status: 403 },
    );
  }

  // 4. Fetch existing brochure record to get the current storage_key and file_size_bytes
  const adminClient = createSupabaseAdminClient();
  const { data: existing, error: fetchError } = await adminClient
    .from("brochures")
    .select("id, title, storage_key, original_filename, file_size_bytes")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Brochure not found." }, { status: 404 });
  }

  const oldStorageKey = existing.storage_key;
  const existingSizeBytes = Number(existing.file_size_bytes || 0);

  // 5. Parse multipart form data
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
  if (!rawFile || !(rawFile instanceof Blob)) {
    return NextResponse.json(
      { error: "A replacement PDF file is required." },
      { status: 400 },
    );
  }

  const originalFilename =
    rawFile instanceof File && rawFile.name
      ? rawFile.name
      : existing.original_filename || "brochure.pdf";

  const arrayBuffer = await rawFile.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const fileSizeBytes = fileBytes.byteLength;

  // 6. Validate input PDF bytes, size (<= 25 MB), and magic header
  const pdfValidation = validatePdfBytes(fileBytes);
  if (!pdfValidation.valid) {
    return NextResponse.json({ error: pdfValidation.error }, { status: 400 });
  }

  // 7. Enforce 2.7 GB storage ceiling: current total - existing file size + replacement size
  try {
    const ceilingCheck = await checkStorageCeiling(
      adminClient,
      fileSizeBytes,
      existingSizeBytes,
    );
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

  // 8. Generate a new immutable storage key
  const newFileUuid = crypto.randomUUID();
  const newStorageKey = generateBrochureKey(id, newFileUuid);

  // 9. Upload replacement file to Supabase Storage
  try {
    await uploadBrochureFile(adminClient, newStorageKey, fileBytes);
  } catch (storageErr: unknown) {
    console.error("[Brochures Replace Storage Upload Failed]", {
      id,
      newStorageKey,
      error: storageErr,
    });
    return NextResponse.json(
      {
        error:
          storageErr instanceof Error
            ? storageErr.message
            : "Could not upload replacement file to Supabase Storage.",
      },
      { status: 500 },
    );
  }

  // 10. Compare-and-swap DB update:
  // WHERE id = current brochure id AND storage_key = old storage key
  const nowIso = new Date().toISOString();

  const { data: updated, error: dbError } = await adminClient
    .from("brochures")
    .update({
      storage_key: newStorageKey,
      original_filename: originalFilename,
      file_size_bytes: fileSizeBytes,
      uploaded_by: user.id, // Current file uploader
      file_uploaded_at: nowIso,
      updated_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("storage_key", oldStorageKey)
    .select()
    .maybeSingle();

  // 12. If the DB update affects zero rows:
  // Delete the new object and report a concurrency conflict
  if (dbError || !updated) {
    console.warn(
      "[Brochures Replace CAS Conflict] Storage key changed concurrently. Deleting new object:",
      { id, newStorageKey, oldStorageKey, dbError },
    );

    try {
      await deleteBrochureFile(adminClient, newStorageKey);
    } catch (cleanupErr) {
      console.error(
        "[Brochures Replace Cleanup Error] Failed to delete orphaned new file:",
        { newStorageKey, cleanupErr },
      );
    }

    return NextResponse.json(
      {
        error: "This brochure was modified or replaced concurrently by another session. Please refresh and try again.",
        conflict: true,
      },
      { status: 409 },
    );
  }

  // 13. If successful: delete the old Supabase Storage object
  try {
    await deleteBrochureFile(adminClient, oldStorageKey);
    console.info("[Brochures Replace Success] Deleted old storage object:", oldStorageKey);
  } catch (oldDeleteErr) {
    console.warn(
      "[Brochures Old Object Delete Warning] Could not remove superseded object:",
      { oldStorageKey, error: oldDeleteErr },
    );
  }

  console.info("[Brochures File Replaced Successfully]", {
    id,
    newStorageKey,
    previousStorageKey: oldStorageKey,
    fileSizeBytes,
    replacedBy: user.id,
  });

  return NextResponse.json({ success: true, brochure: updated });
}
