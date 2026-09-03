-- Allow leads forwarded from the Google Sheets to Facebook bridge.
alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (source in ('google_ads', 'meta_ads', 'facebook_sheets_bridge'));