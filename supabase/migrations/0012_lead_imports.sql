-- Migration 0012: Add public.lead_imports table for tracking batch CSV imports

create table if not exists public.lead_imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source text not null default 'meta_ads',
  uploaded_by uuid references auth.users(id),
  uploaded_by_email text,
  total_rows int not null default 0,
  created_count int not null default 0,
  existing_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  summary jsonb,
  created_at timestamptz not null default now()
);

alter table public.lead_imports enable row level security;

create policy "Staff and admin can view lead_imports"
on public.lead_imports
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff'));

create policy "Admin can insert lead_imports"
on public.lead_imports
for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

