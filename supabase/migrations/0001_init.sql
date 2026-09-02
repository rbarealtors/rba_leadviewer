-- RBA Realtors Lead Viewer — initial schema
-- Single table for unified Google Ads + Meta Ads leads.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  source text not null
    check (source in ('google_ads', 'meta_ads')),

  external_lead_id text not null,

  full_name text,
  phone_number text,
  email text,

  campaign_name text,
  ad_group_name text,
  ad_name text,

  budget_range text,
  bhk_configuration text,
  planning_timeline text,

  platform text
    check (platform is null or platform in ('facebook', 'instagram')),

  source_submitted_at timestamptz not null,

  created_at timestamptz not null default now(),

  viewed_at timestamptz,

  raw_payload jsonb not null,

  constraint leads_source_external_id_unique unique (source, external_lead_id)
);

-- The unique constraint above already creates a composite index on
-- (source, external_lead_id), which also serves lookups filtered by
-- `source` alone reasonably well for our low volume, but we still add a
-- dedicated `source` index below since the source filter is a primary UI
-- filter and shouldn't depend on constraint-index internals.

create index if not exists leads_source_submitted_at_desc_idx
  on public.leads (source_submitted_at desc);

create index if not exists leads_source_idx
  on public.leads (source);

create index if not exists leads_campaign_name_idx
  on public.leads (campaign_name);

create index if not exists leads_ad_group_name_idx
  on public.leads (ad_group_name);

create index if not exists leads_viewed_at_idx
  on public.leads (viewed_at);

-- Row Level Security
alter table public.leads enable row level security;

-- Authenticated staff can read all leads.
create policy "authenticated users can read leads"
  on public.leads
  for select
  to authenticated
  using (true);

-- Authenticated staff can only ever touch viewed_at, never the submitted
-- lead fields. We can't restrict *which column* an UPDATE touches purely
-- through RLS (RLS gates rows, not columns), so the column-level lockdown
-- is enforced with a GRANT that only allows UPDATE on the viewed_at column,
-- combined with the app never sending a full-row update (see
-- src/app/leads/actions.ts). Belt-and-braces: a trigger rejects any UPDATE
-- that changes a non-viewed_at column.
create policy "authenticated users can update viewed_at"
  on public.leads
  for update
  to authenticated
  using (true)
  with check (true);

revoke update on public.leads from authenticated;
grant update (viewed_at) on public.leads to authenticated;

-- Defense in depth: reject any update that touches a submitted-data column,
-- even if it somehow arrives via a future code path.
create or replace function public.leads_protect_submitted_fields()
returns trigger
language plpgsql
as $$
begin
  if new.source is distinct from old.source
     or new.external_lead_id is distinct from old.external_lead_id
     or new.full_name is distinct from old.full_name
     or new.phone_number is distinct from old.phone_number
     or new.email is distinct from old.email
     or new.campaign_name is distinct from old.campaign_name
     or new.ad_group_name is distinct from old.ad_group_name
     or new.ad_name is distinct from old.ad_name
     or new.budget_range is distinct from old.budget_range
     or new.bhk_configuration is distinct from old.bhk_configuration
     or new.planning_timeline is distinct from old.planning_timeline
     or new.platform is distinct from old.platform
     or new.source_submitted_at is distinct from old.source_submitted_at
     or new.created_at is distinct from old.created_at
     or new.raw_payload is distinct from old.raw_payload
  then
    raise exception 'Submitted lead fields are read-only; only viewed_at may be updated';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_protect_submitted_fields_trigger on public.leads;
create trigger leads_protect_submitted_fields_trigger
  before update on public.leads
  for each row
  execute function public.leads_protect_submitted_fields();

-- No anonymous access at all: anon role gets nothing. Webhook ingestion
-- uses the service-role key server-side, which bypasses RLS entirely and
-- is never reachable from the browser.
revoke all on public.leads from anon;
