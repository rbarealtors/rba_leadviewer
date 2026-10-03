-- Migration 0015: System Settings
-- ======================================================================
-- Dedicated key/value system settings table for application-wide
-- administrative configuration.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Row Level Security (RLS)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 1. Authenticated users can read system settings
CREATE POLICY "Allow authenticated read system_settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Only Admins can modify system settings
CREATE POLICY "Allow admin write system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Seed default maximum PDF source size for browser processing (150 MB)
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'max_browser_pdf_source_mb',
  '150'::jsonb,
  'Maximum PDF source size in megabytes allowed for browser-side optimization before upload.'
)
ON CONFLICT (key) DO NOTHING;
