CREATE OR REPLACE FUNCTION get_lead_kpis()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_count', COUNT(*),
    'new_count', COUNT(*) FILTER (WHERE viewed_at IS NULL),
    'viewed_count', COUNT(*) FILTER (WHERE viewed_at IS NOT NULL),
    'google_count', COUNT(*) FILTER (WHERE source = 'google_ads'),
    'meta_count', COUNT(*) FILTER (WHERE source = 'meta_ads'),
    'acres_count', COUNT(*) FILTER (WHERE source = '99acres'),
    'mb_count', COUNT(*) FILTER (WHERE source = 'magicbricks')
  )
  FROM public.leads;
$$;
