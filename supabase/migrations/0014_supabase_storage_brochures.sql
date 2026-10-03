-- Migration 0014: Private Supabase Storage Bucket for Brochures
-- ======================================================================
-- Register the private 'brochures' storage bucket with 25MB file size limit
-- and application/pdf mime type restriction.
-- ======================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brochures',
  'brochures',
  false,
  26214400,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['application/pdf'];
