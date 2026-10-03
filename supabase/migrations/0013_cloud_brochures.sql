-- Migration 0013: Cloud Brochure Library
-- ======================================================================
-- Dedicated metadata table for brochures stored in Cloudflare R2.
-- Enforces private access, immutable keys, strict PDF validation,
-- role-based RLS, and soft archive/restore lifecycle.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.brochures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  project_name TEXT NULL,
  description TEXT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  uploaded_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NULL,
  archived_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  file_uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints per specification
  CONSTRAINT brochures_storage_key_prefix CHECK (storage_key LIKE 'brochures/%'),
  CONSTRAINT brochures_mime_type_pdf CHECK (mime_type = 'application/pdf'),
  CONSTRAINT brochures_file_size_positive CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  CONSTRAINT brochures_title_non_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT brochures_project_name_normalized CHECK (project_name IS NULL OR length(trim(project_name)) > 0)
);

-- Trigger to sanitize and normalize text inputs & timestamps
CREATE OR REPLACE FUNCTION public.brochures_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trim title
  NEW.title = trim(NEW.title);

  -- Normalize project_name: collapse repeated spaces, empty becomes NULL
  IF NEW.project_name IS NOT NULL THEN
    NEW.project_name = trim(regexp_replace(NEW.project_name, '\s+', ' ', 'g'));
    IF length(NEW.project_name) = 0 THEN
      NEW.project_name = NULL;
    END IF;
  END IF;

  -- Trim description if present
  IF NEW.description IS NOT NULL THEN
    NEW.description = trim(NEW.description);
    IF length(NEW.description) = 0 THEN
      NEW.description = NULL;
    END IF;
  END IF;

  -- Always update timestamp on modification
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brochures_before_write_trigger ON public.brochures;
CREATE TRIGGER brochures_before_write_trigger
  BEFORE INSERT OR UPDATE ON public.brochures
  FOR EACH ROW
  EXECUTE FUNCTION public.brochures_before_write();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brochures_archived_at
  ON public.brochures (archived_at);

CREATE INDEX IF NOT EXISTS idx_brochures_project_name
  ON public.brochures (project_name);

CREATE INDEX IF NOT EXISTS idx_brochures_created_at
  ON public.brochures (created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE public.brochures ENABLE ROW LEVEL SECURITY;

-- 1. Sales can SELECT active brochures only
CREATE POLICY "Sales can select active brochures"
  ON public.brochures
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
    AND archived_at IS NULL
  );

-- 2. Staff and Admin can SELECT all brochures (active and archived)
CREATE POLICY "Management can select all brochures"
  ON public.brochures
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('staff', 'admin')
  );

-- Direct INSERT / UPDATE / DELETE are explicitly NOT permitted to authenticated/anon via PostgREST.
-- All mutations go through server-side authenticated route handlers using the service-role client.
GRANT SELECT ON public.brochures TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.brochures FROM authenticated, anon;
