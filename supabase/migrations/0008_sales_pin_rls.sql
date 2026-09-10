-- 1. Enable RLS on leads table (if not already enabled)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (to ensure clean state, although there might not be any if it was previously accessible by all authenticated users)
DROP POLICY IF EXISTS "Admin and staff full access" ON public.leads;
DROP POLICY IF EXISTS "Sales reps assigned leads select" ON public.leads;
DROP POLICY IF EXISTS "Sales reps assigned leads update" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.leads;

-- 3. Create comprehensive RLS policies

-- Admin and Staff have full access to all leads
CREATE POLICY "Admin and staff full access"
ON public.leads
FOR ALL
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff')
);

-- Sales reps can ONLY view leads assigned to them
CREATE POLICY "Sales reps assigned leads select"
ON public.leads
FOR SELECT
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales' 
  AND assigned_to = auth.uid()
);

-- Sales reps can ONLY update leads assigned to them
CREATE POLICY "Sales reps assigned leads update"
ON public.leads
FOR UPDATE
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales' 
  AND assigned_to = auth.uid()
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales' 
  AND assigned_to = auth.uid()
);

-- Note: Insert and Delete operations are not granted to sales reps.
-- Only admin and staff can insert (or webhooks via service role) and delete.

