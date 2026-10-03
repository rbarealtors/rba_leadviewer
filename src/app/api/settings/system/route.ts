import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/authorization";
import { validateRequestOrigin } from "@/lib/auth/csrf";
import {
  getMaxBrowserPdfSourceMb,
  updateMaxBrowserPdfSourceMb,
  validatePdfSourceLimit,
  PDF_SOURCE_LIMIT_BOUNDS,
} from "@/lib/settings/system-settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/system
 * Returns application system settings.
 * Accessible to authenticated users.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const maxSourceMb = await getMaxBrowserPdfSourceMb(supabase);

  return NextResponse.json({
    max_browser_pdf_source_mb: maxSourceMb,
    bounds: {
      min: PDF_SOURCE_LIMIT_BOUNDS.MIN_MB,
      default: PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB,
      max: PDF_SOURCE_LIMIT_BOUNDS.MAX_MB,
    },
  });
}

/**
 * PUT /api/settings/system
 * Admin-only: Updates application system settings.
 */
export async function PUT(request: Request) {
  // 1. Validate CSRF Origin
  if (!validateRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  // 2. Authenticate
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 3. Strictly authorize Admin role
  if (!isAdmin(user)) {
    return NextResponse.json(
      { error: "Administrator permissions required to modify system settings." },
      { status: 403 },
    );
  }

  // 4. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { max_browser_pdf_source_mb } = body;

  const validation = validatePdfSourceLimit(max_browser_pdf_source_mb);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // 5. Update using service-role admin client
  try {
    const adminClient = createSupabaseAdminClient();
    const result = await updateMaxBrowserPdfSourceMb(
      validation.value,
      adminClient,
      user.id,
    );

    return NextResponse.json({
      success: true,
      max_browser_pdf_source_mb: result.value,
      message: `Maximum PDF browser processing size updated to ${result.value} MB.`,
    });
  } catch (err: unknown) {
    console.error("[SystemSettings API Error]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update system setting.",
      },
      { status: 500 },
    );
  }
}
