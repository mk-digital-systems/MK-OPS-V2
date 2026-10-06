-- Günlük iş planında ekibe araç atamak opsiyonel.
-- İnşaat vb. firmalarda her ekibin aracı olmayabilir; araçsız ekip vehicle_plate = null.

alter table public.daily_work_plan_teams
  alter column vehicle_plate drop not null;

alter table public.daily_work_plan_teams
  drop constraint if exists dwp_teams_plate;

alter table public.daily_work_plan_teams
  add constraint dwp_teams_plate
  check (vehicle_plate is null or char_length(trim(vehicle_plate)) >= 1);

comment on table public.daily_work_plan_teams is 'Günlük plan ekipleri — proje/araç snapshot (araç opsiyonel)';

-- Araçsız ekipler önerilerde boş satır olarak görünmesin.
create or replace function public.get_vehicle_plate_suggestions(p_query text default ''::text, p_limit integer default 20)
returns table(value text)
language sql stable
set search_path to 'public'
as $$
  select distinct t.vehicle_plate as value
  from public.daily_work_plan_teams t
  where t.vehicle_plate is not null
    and (p_query = '' or t.vehicle_plate ilike '%' || p_query || '%')
  order by t.vehicle_plate
  limit greatest(1, least(p_limit, 50));
$$;
