-- Staff may correct a lead's name while submitted fields remain protected.
grant update (viewed_at, full_name) on public.leads to authenticated;

create or replace function public.leads_protect_submitted_fields()
returns trigger
language plpgsql
as $$
begin
  if new.source is distinct from old.source
     or new.external_lead_id is distinct from old.external_lead_id
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
    raise exception 'Submitted lead fields are read-only; only full_name and viewed_at may be updated';
  end if;
  return new;
end;
$$;