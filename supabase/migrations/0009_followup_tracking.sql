alter table public.leads
  add column if not exists rnr_streak integer not null default 0,
  add column if not exists needs_staff_review boolean not null default false;

-- Normalize lead_status values going forward: 'active' | 'closed'
-- (existing rows with the old literal 'Assigned' string still match
--  the `neq('closed')` filter used in queries, so no backfill required
--  for the feed to keep working — but new writes use 'active')

create index if not exists idx_leads_next_follow_up_status
  on public.leads(next_follow_up)
  where lead_status != 'closed';

create index if not exists idx_leads_needs_review
  on public.leads(needs_staff_review)
  where needs_staff_review = true;

grant update (rnr_streak, needs_staff_review) on public.leads to authenticated;
