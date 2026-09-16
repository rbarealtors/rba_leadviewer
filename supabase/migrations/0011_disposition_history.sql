-- Migration 0011: Phase 1A — Disposition History & Follow-Up Tracking
-- ======================================================================
-- Adds canonical CRM disposition tracking and an immutable history table.
--
-- Does NOT:
--   - Rename next_follow_up (already canonical as timestamptz)
--   - Touch the existing `disposition` column (raw call-outcome strings)
--   - Modify any existing RLS policies, grants, or triggers
--   - Create fake history rows during the backfill
-- ======================================================================

-- ── Step 1: Add metadata columns to public.leads ─────────────────────────────

alter table public.leads
  add column if not exists crm_disposition text,
  add column if not exists disposition_updated_at timestamptz,
  add column if not exists disposition_updated_by uuid;

-- ── Step 2: Backfill crm_disposition from existing stage/disposition data ─────
-- Evaluated in priority order. No history rows are created by the backfill.

update public.leads
set
  crm_disposition = case
    when lead_stage = 'CLOSED'                                          then 'Closed — Won'
    when lead_stage = 'LOST'                                           then 'Closed — Lost'
    when lead_stage = 'BOOKING'                                        then 'Site Visit Done'
    when lead_stage = 'SITE_VISIT'                                     then 'Site Visit Scheduled'
    when disposition in ('Not Interested', 'Wrong Number')             then 'Contacted — Not Interested'
    when disposition = 'Connected'                                     then 'Contacted — Interested'
    when disposition in ('No Answer', 'Busy / Call Later')             then 'Contacted — No Answer'
    else                                                                    'Not Contacted'
  end,
  disposition_updated_at = now(),
  disposition_updated_by = null   -- system backfill; no authenticated user
where crm_disposition is null;

-- ── Step 3: Apply CHECK constraint and NOT NULL + DEFAULT now that all rows ───
--            have a value.

alter table public.leads
  add constraint leads_crm_disposition_values_check
    check (crm_disposition in (
      'Not Contacted',
      'Contacted — No Answer',
      'Contacted — Interested',
      'Contacted — Not Interested',
      'Budget Mismatch',
      'Site Visit Scheduled',
      'Site Visit Done',
      'Closed — Won',
      'Closed — Lost'
    )),
  alter column crm_disposition set not null,
  alter column crm_disposition set default 'Not Contacted';

-- ── Step 4: Indexes on new leads columns ─────────────────────────────────────

create index if not exists idx_leads_crm_disposition
  on public.leads (crm_disposition)
  where lead_status != 'closed';

create index if not exists idx_leads_disposition_updated
  on public.leads (disposition_updated_at desc nulls last)
  where crm_disposition is not null;

-- ── Step 5: Create public.lead_disposition_history ───────────────────────────

create table if not exists public.lead_disposition_history (
  id               uuid        primary key default gen_random_uuid(),
  lead_id          uuid        not null
                                 references public.leads(id) on delete cascade,
  old_disposition  text,                        -- nullable on first transition
  new_disposition  text        not null,
  changed_by       uuid,                        -- nullable for system transitions
  changed_at       timestamptz not null default now(),
  note             text
);

-- Primary access: all history for a lead, newest first
create index if not exists idx_disp_history_lead_changed
  on public.lead_disposition_history (lead_id, changed_at desc);

-- Reporting: filter / count by disposition value over time
create index if not exists idx_disp_history_new_disp_changed
  on public.lead_disposition_history (new_disposition, changed_at desc);

-- ── Step 6: RLS on lead_disposition_history ───────────────────────────────────

alter table public.lead_disposition_history enable row level security;

-- Admin and staff: full read access across all leads
create policy "Admin and staff can read disposition history"
  on public.lead_disposition_history
  for select
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff')
  );

-- Sales: read-only for their assigned leads only
create policy "Sales reps can read disposition history for assigned leads"
  on public.lead_disposition_history
  for select
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
    and lead_id in (
      select id from public.leads where assigned_to = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE granted to authenticated role.
-- All writes go through the SECURITY DEFINER trigger below.

-- ── Step 7: Trigger function: append one history row per crm_disposition change

create or replace function public.leads_track_disposition_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed_by uuid;
begin
  -- Only act when crm_disposition actually changes
  if new.crm_disposition is distinct from old.crm_disposition then

    -- auth.uid() is available in row-level triggers called in a user session;
    -- returns NULL when invoked via the service role (admin client).
    begin
      v_changed_by := auth.uid();
    exception when others then
      v_changed_by := null;
    end;

    insert into public.lead_disposition_history (
      lead_id,
      old_disposition,
      new_disposition,
      changed_by,
      changed_at
    ) values (
      new.id,
      old.crm_disposition,
      new.crm_disposition,
      v_changed_by,
      now()
    );

    -- Keep the metadata columns on the lead row in sync.
    -- Because this is a BEFORE trigger, we mutate NEW before the row is written.
    new.disposition_updated_at := now();
    new.disposition_updated_by := v_changed_by;
  end if;

  return new;
end;
$$;

-- Drop-then-create is idempotent (safe to re-run)
drop trigger if exists leads_track_disposition_history_trigger on public.leads;
create trigger leads_track_disposition_history_trigger
  before update on public.leads
  for each row
  execute function public.leads_track_disposition_history();

-- ── Step 8: Realtime publication (optional — enable if history streaming needed)
-- alter table public.lead_disposition_history replica identity full;
-- alter publication supabase_realtime add table public.lead_disposition_history;

-- ── Verification (run in Supabase SQL editor after applying) ─────────────────
-- SELECT crm_disposition, count(*) FROM public.leads GROUP BY 1 ORDER BY 2 DESC;
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'leads'
--     AND column_name IN ('crm_disposition','disposition_updated_at','disposition_updated_by')
--   ORDER BY column_name;
-- SELECT * FROM public.lead_disposition_history LIMIT 5;
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'lead_disposition_history';

