import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SYSTEM_SETTING_KEYS = {
  MAX_BROWSER_PDF_SOURCE_MB: "max_browser_pdf_source_mb",
} as const;

export const PDF_SOURCE_LIMIT_BOUNDS = {
  MIN_MB: 25,
  DEFAULT_MB: 150,
  MAX_MB: 250,
} as const;

export interface SystemSetting<T = unknown> {
  key: string;
  value: T;
  description?: string | null;
  updated_at: string;
  updated_by?: string | null;
}

/**
 * Validates the configured PDF source limit in megabytes.
 * Must be an integer between 25 MB and 250 MB inclusive.
 */
export function validatePdfSourceLimit(mb: unknown): {
  valid: boolean;
  error?: string;
  value: number;
} {
  const num = typeof mb === "number" ? mb : Number(mb);
  if (isNaN(num) || !Number.isFinite(num) || !Number.isInteger(num)) {
    return {
      valid: false,
      error: "Maximum PDF source size must be an integer number of megabytes.",
      value: PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB,
    };
  }

  if (num < PDF_SOURCE_LIMIT_BOUNDS.MIN_MB) {
    return {
      valid: false,
      error: `Maximum PDF source size cannot be less than ${PDF_SOURCE_LIMIT_BOUNDS.MIN_MB} MB (must be at least equal to the 25 MB storage limit).`,
      value: num,
    };
  }

  if (num > PDF_SOURCE_LIMIT_BOUNDS.MAX_MB) {
    return {
      valid: false,
      error: `Maximum PDF source size cannot exceed ${PDF_SOURCE_LIMIT_BOUNDS.MAX_MB} MB to protect browser memory.`,
      value: num,
    };
  }

  return { valid: true, value: num };
}

/**
 * Retrieves the configured maximum PDF source size in megabytes.
 * Falls back to 150 MB if not set, table missing, or on any database error.
 */
export async function getMaxBrowserPdfSourceMb(
  customClient?: SupabaseClient,
): Promise<number> {
  try {
    const supabase = customClient || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SYSTEM_SETTING_KEYS.MAX_BROWSER_PDF_SOURCE_MB)
      .maybeSingle();

    if (error || !data || data.value === null || data.value === undefined) {
      return PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB;
    }

    const parsed = Number(data.value);
    const validation = validatePdfSourceLimit(parsed);
    return validation.valid ? validation.value : PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB;
  } catch (err) {
    console.warn("[SystemSettings] Error reading max_browser_pdf_source_mb, falling back to default:", err);
    return PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB;
  }
}

/**
 * Updates the maximum PDF source size for browser processing.
 * Must be executed by an Admin using the Supabase admin/server client.
 */
export async function updateMaxBrowserPdfSourceMb(
  mb: number,
  adminClient: SupabaseClient,
  userId?: string,
): Promise<{ success: boolean; value: number }> {
  const validation = validatePdfSourceLimit(mb);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const nowIso = new Date().toISOString();
  const { error } = await adminClient
    .from("system_settings")
    .upsert(
      {
        key: SYSTEM_SETTING_KEYS.MAX_BROWSER_PDF_SOURCE_MB,
        value: validation.value,
        description:
          "Maximum PDF source size in megabytes allowed for browser-side optimization before upload.",
        updated_at: nowIso,
        updated_by: userId || null,
      },
      { onConflict: "key" },
    );

  if (error) {
    throw new Error(`Failed to save system setting: ${error.message}`);
  }

  return { success: true, value: validation.value };
}
