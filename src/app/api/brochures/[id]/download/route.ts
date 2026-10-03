import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppRole } from "@/lib/auth/authorization";
import { downloadBrochureFile } from "@/lib/storage/supabase-storage";
import { sanitizeDownloadFilename } from "@/lib/brochures/validate";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

/**
 * GET /api/brochures/[id]/download
 *
 * Downloads a brochure:
 * 1. Independently authenticates the user.
 * 2. Authorizes user role.
 * 3. Verifies brochure exists.
 * 4. Rejects archived brochures for Sales (404 Not Found to prevent leaking existence).
 * 5. Fetches the private file from Supabase Storage server-side.
 * 6. Streams binary content to the user with required attachment headers.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Validate UUID format
  if (!id || !UUID_REGEX.test(id)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 2. Independently authenticate the user
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Authentication required", { status: 401 });
  }

  // 3. Authorize the role
  const role = getAppRole(user);

  // 4. Fetch brochure metadata
  const { data: brochure, error } = await supabase
    .from("brochures")
    .select("id, title, storage_key, original_filename, file_size_bytes, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !brochure) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 5. Prevent Sales from accessing archived brochures (generic 404 to avoid leaking existence)
  if (brochure.archived_at !== null && role === "sales") {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 6. Retrieve object server-side from private Supabase Storage
  try {
    const adminClient = createSupabaseAdminClient();
    const blob = await downloadBrochureFile(adminClient, brochure.storage_key);

    const downloadFilename = sanitizeDownloadFilename(
      brochure.original_filename,
      brochure.title,
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${downloadFilename}"`);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("Content-Length", String(blob.size));

    return new NextResponse(blob.stream(), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[Brochures Download Error]", { id, error: err });
    return new NextResponse("Could not retrieve brochure file.", { status: 500 });
  }
}
