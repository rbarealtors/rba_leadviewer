-- Allow property ID mapping for portal leads (Magicbricks, 99acres).
alter table public.campaign_mappings
  drop constraint if exists campaign_mappings_type_check;

alter table public.campaign_mappings
  add constraint campaign_mappings_type_check
  check (type in ('campaign', 'adgroup', 'property'));

-- Ensure RLS allows select for staff and public/server read without silent empty results.
grant select on public.campaign_mappings to anon, authenticated;

-- If Row Level Security is enabled on campaign_mappings, allow public read access
alter table public.campaign_mappings enable row level security;

drop policy if exists "allow select campaign_mappings" on public.campaign_mappings;
create policy "allow select campaign_mappings"
  on public.campaign_mappings
  for select
  using (true);

