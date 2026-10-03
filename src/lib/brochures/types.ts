/** Maximum allowed brochure individual upload file size for V1 (25 MB) */
export const MAX_BROCHURE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 26,214,400 bytes

/**
 * Hard storage ceiling for Supabase Free: 2.7 GB (leaving 300 MB margin below 3 GB limit).
 * 2.7 * 1024 * 1024 * 1024 = 2,899,102,925 bytes.
 */
export const MAX_TOTAL_STORAGE_BYTES = 2.7 * 1024 * 1024 * 1024; // 2,899,102,925 bytes

/** Canonical MIME type */
export const ALLOWED_BROCHURE_MIME_TYPE = "application/pdf";

/** Magic bytes prefix for PDF files */
export const PDF_MAGIC_BYTES = "%PDF-";

/** Name of the private Supabase Storage bucket for brochures */
export const BROCHURES_STORAGE_BUCKET = "brochures";

/** Full brochure entity as stored in public.brochures */
export interface Brochure {
  id: string;
  title: string;
  project_name: string | null;
  description: string | null;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  file_uploaded_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Restricted brochure view exposed to Sales clients.
 * Never includes storage_key, archived_at, archived_by, or internal tracking.
 */
export interface BrochureSalesView {
  id: string;
  title: string;
  project_name: string | null;
  description: string | null;
  original_filename: string;
  file_size_bytes: number;
  file_uploaded_at: string;
  updated_at: string;
}
