-- Migration 0010: Sales Workflow Foundation

-- 1. Extend public.leads
alter table public.leads
  add column lead_stage text not null default 'NEW' check (lead_stage in ('NEW', 'CONTACTED', 'SITE_VISIT', 'BOOKING', 'CLOSED', 'LOST')),
  add column token_amount numeric(12, 2),
  add column token_received_at timestamptz,
  add column token_payment_method text,
  add column token_reference_number text,
  add column booking_unit_details text,
  add column closed_at timestamptz;

-- Revoke previously broadly granted update permissions on sensitive columns
revoke update (assigned_to, assigned_at, lead_status, disposition, disposition_details, next_follow_up) on public.leads from authenticated;

-- (Optional) If we still want authenticated users to be able to update viewed_at and full_name
grant update (viewed_at, full_name) on public.leads to authenticated;

-- Backfill existing rows
update public.leads
set lead_stage = case
  when lead_status = 'closed' then 'CLOSED'
  when disposition is not null then 'CONTACTED'
  else 'NEW'
end;

-- 2. Create public.site_visits Table
create table public.site_visits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid,
  created_by uuid,
  visit_number int not null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  property_name text,
  location text,
  notes text,
  outcome_notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  rescheduled_from_id uuid references public.site_visits(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_visits enable row level security;

create policy "Staff and admins have full access to site_visits"
on public.site_visits
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin'));

create policy "Sales reps can view their own site_visits"
on public.site_visits
for select
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

create policy "Sales reps can insert site_visits for assigned leads"
on public.site_visits
for insert
to authenticated
with check (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

create policy "Sales reps can update their site_visits"
on public.site_visits
for update
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

-- 3. Create public.lead_activities Table
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid,
  type text not null,
  title text not null,
  description text,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.lead_activities enable row level security;

create policy "Staff and admins have full access to lead_activities"
on public.lead_activities
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin'));

create policy "Sales reps can view their assigned leads activities"
on public.lead_activities
for select
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

-- Activities are immutable, so we don't grant update or delete to sales
create policy "Sales reps can insert activities for assigned leads"
on public.lead_activities
for insert
to authenticated
with check (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

-- 4. Create public.lead_assignments Table
create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_by uuid,
  assigned_to uuid,
  previous_assigned_to uuid,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.lead_assignments enable row level security;

create policy "Staff and admins have full access to lead_assignments"
on public.lead_assignments
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin'));

create policy "Sales reps can view assignments for their leads"
on public.lead_assignments
for select
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  and lead_id in (select id from public.leads where assigned_to = auth.uid())
);

-- 5. Create public.notifications Table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lead_id uuid references public.leads(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Users can manage their own notifications"
on public.notifications
for all
to authenticated
using (user_id = auth.uid());

-- 6. Trigger to prevent sales reassignment
create or replace function public.leads_prevent_sales_reassignment()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales' then
    if new.assigned_to is distinct from old.assigned_to or new.assigned_at is distinct from old.assigned_at then
      raise exception 'Sales representatives cannot assign or reassign leads.';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_prevent_sales_reassignment_trigger
  before update on public.leads
  for each row
  execute function public.leads_prevent_sales_reassignment();

-- 7. Realtime Publication
alter table public.leads replica identity full;
alter table public.site_visits replica identity full;
alter table public.lead_activities replica identity full;
alter table public.notifications replica identity full;

alter publication supabase_realtime add table public.site_visits;
alter publication supabase_realtime add table public.lead_activities;
alter publication supabase_realtime add table public.notifications;

