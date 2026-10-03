import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BROCHURES_STORAGE_BUCKET,
  MAX_TOTAL_STORAGE_BYTES,
  MAX_BROCHURE_FILE_SIZE_BYTES,
} from "@/lib/brochures/types";
import { formatFileSize } from "@/lib/brochures/validate";

let bucketEnsured = false;

/**
 * Translates a canonical database storage_key ("brochures/{id}/{file_uuid}.pdf")
 * into bucket name and relative object path for Supabase Storage.
 */
export function storageKeyToBucketPath(storageKey: string): {
  bucket: string;
  path: string;
} {
  const prefix = `${BROCHURES_STORAGE_BUCKET}/`;
  if (storageKey.startsWith(prefix)) {
    return {
      bucket: BROCHURES_STORAGE_BUCKET,
      path: storageKey.slice(prefix.length),
    };
  }
  return {
    bucket: BROCHURES_STORAGE_BUCKET,
    path: storageKey,
  };
}

/**
 * Ensures the private 'brochures' storage bucket exists in Supabase.
 * Checks once per worker instance to avoid redundant network calls.
 */
export async function ensureBrochuresBucket(
  supabaseAdmin: SupabaseClient,
): Promise<void> {
  if (bucketEnsured) return;

  try {
    const { data: bucket, error: getError } =
      await supabaseAdmin.storage.getBucket(BROCHURES_STORAGE_BUCKET);

    if (getError || !bucket) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(
        BROCHURES_STORAGE_BUCKET,
        {
          public: false,
          fileSizeLimit: MAX_BROCHURE_FILE_SIZE_BYTES,
          allowedMimeTypes: ["application/pdf"],
        },
      );

      if (createError && !createError.message.includes("already exists")) {
        console.warn(
          "[Supabase Storage] Could not create bucket automatically:",
          createError.message,
        );
      }
    }
    bucketEnsured = true;
  } catch (err) {
    console.warn("[Supabase Storage] Error verifying bucket:", err);
  }
}

/**
 * Uploads an optimized brochure PDF to private Supabase Storage.
 */
export async function uploadBrochureFile(
  supabaseAdmin: SupabaseClient,
  storageKey: string,
  fileBytes: Uint8Array | ArrayBuffer,
): Promise<{ sizeBytes: number }> {
  await ensureBrochuresBucket(supabaseAdmin);

  const { bucket, path } = storageKeyToBucketPath(storageKey);
  const bytes =
    fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Failed to upload file to Supabase Storage: ${error.message}`,
    );
  }

  return { sizeBytes: bytes.byteLength };
}

/**
 * Downloads a private brochure file from Supabase Storage as a Blob.
 */
export async function downloadBrochureFile(
  supabaseAdmin: SupabaseClient,
  storageKey: string,
): Promise<Blob> {
  const { bucket, path } = storageKeyToBucketPath(storageKey);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);

  if (error || !data) {
    throw new Error(
      `Could not retrieve brochure from Supabase Storage: ${error?.message || "File not found"}`,
    );
  }

  return data;
}

/**
 * Deletes an object from Supabase Storage by its storage key.
 */
export async function deleteBrochureFile(
  supabaseAdmin: SupabaseClient,
  storageKey: string,
): Promise<void> {
  const { bucket, path } = storageKeyToBucketPath(storageKey);

  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);

  if (error) {
    console.warn("[Supabase Storage Delete Warning]", {
      storageKey,
      path,
      error: error.message,
    });
  }
}

/**
 * Calculates current total storage used across all brochures in the database (including archived).
 * Per requirements: "For storage accounting, archived files still count toward the 2.7 GB limit until actually deleted."
 */
export async function getCurrentStorageUsageBytes(
  supabaseAdmin: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("brochures")
    .select("file_size_bytes");

  if (error) {
    console.error("[Storage Usage Query Failed]", error);
    throw new Error(`Failed to calculate current storage usage: ${error.message}`);
  }

  const total = (data || []).reduce(
    (sum: number, row: { file_size_bytes: number }) =>
      sum + Number(row.file_size_bytes || 0),
    0,
  );

  return total;
}

/**
 * Evaluates whether adding `newSizeBytes` (minus `existingSizeBytesToSubtract` in replacement flows)
 * would exceed the 2.7 GB hard storage ceiling.
 */
export async function checkStorageCeiling(
  supabaseAdmin: SupabaseClient,
  newSizeBytes: number,
  existingSizeBytesToSubtract: number = 0,
): Promise<{
  allowed: boolean;
  currentTotalBytes: number;
  projectedTotalBytes: number;
  maxBytes: number;
  error?: string;
}> {
  const currentTotalBytes = await getCurrentStorageUsageBytes(supabaseAdmin);
  const projectedTotalBytes =
    currentTotalBytes - existingSizeBytesToSubtract + newSizeBytes;

  if (projectedTotalBytes > MAX_TOTAL_STORAGE_BYTES) {
    const projectedFormatted = formatFileSize(projectedTotalBytes);
    const maxFormatted = formatFileSize(MAX_TOTAL_STORAGE_BYTES);
    return {
      allowed: false,
      currentTotalBytes,
      projectedTotalBytes,
      maxBytes: MAX_TOTAL_STORAGE_BYTES,
      error: `Storage ceiling reached: this operation would result in ${projectedFormatted} of stored brochure data, exceeding the ${maxFormatted} limit.`,
    };
  }

  return {
    allowed: true,
    currentTotalBytes,
    projectedTotalBytes,
    maxBytes: MAX_TOTAL_STORAGE_BYTES,
  };
}
