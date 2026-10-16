-- Planlanan imalatlar (keşif / proje kalemleri) bitince proje kendiliğinden "tamamlandı" olmaz;
-- proje sayfası "Projeyi tamamlayalım mı?" diye sorar. İlk imalat girilince proje zaten "Devam ediyor" olur.

alter table public.projects add column completion_ready boolean not null default false;
comment on column public.projects.completion_ready is
  'Planlanan bütün imalatlar tamamlandı; kullanıcıya projeyi tamamlamak isteyip istemediği sorulur';

create or replace function public.refresh_poz_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kesif integer;
  v_percent numeric;
  v_activity boolean;
  v_kesif_done boolean;
  v_last_log record;
begin
  select count(*), coalesce(avg(percent), 0), coalesce(bool_and(percent >= 100), false) into v_kesif, v_percent, v_kesif_done
  from public.project_stage_progress
  where project_id = p_project_id and target_quantity is not null;

  select exists (
    select 1 from public.project_stage_logs l
    join public.project_stage_progress p on p.id = l.progress_id
    where p.project_id = p_project_id
  ) into v_activity;

  select l.team_leader_personnel_id, l.team_leader_name into v_last_log
  from public.project_stage_logs l
  join public.project_stage_progress p on p.id = l.progress_id
  where p.project_id = p_project_id and l.team_leader_name is not null
  order by l.log_date desc, l.created_at desc
  limit 1;

  update public.projects
  set
    progress_percent = case when v_kesif = 0 then 0 else round(v_percent)::integer end,
    has_activity = has_activity or v_activity,
    completion_ready = v_kesif > 0 and v_kesif_done and status not in ('completed', 'on_hold'),
    current_team_leader_personnel_id = coalesce(v_last_log.team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_last_log.team_leader_name, current_team_leader_name)
  where id = p_project_id;
end;
$$;

create or replace function public.refresh_project_rollup(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_has_sections boolean;
  v_percent numeric := 0;
  v_unit_count integer := 0;
  v_all_done boolean := false;
  v_activity boolean := false;
  v_last_log record;
  v_screen text;
  v_catalog_type boolean;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then return; end if;

  -- HP ve kurumsal projelerin durumu paftalardan / elle; katalogdan kurulan standart türler poz kuralıyla.
  select t.screen, t.catalog_type_id is not null into v_screen, v_catalog_type
  from public.project_types t where t.id = v_project.project_type_id;
  if v_screen <> 'standard' then
    return;
  end if;
  if v_catalog_type then
    perform public.refresh_poz_project(p_project_id);
    return;
  end if;
  select has_sections into v_has_sections from public.project_types where id = v_project.project_type_id;

  -- Birim: bölümlü projede her bölüm, değilse projenin kendisi.
  select coalesce(avg(unit_percent), 0), count(*), coalesce(bool_and(unit_done), false)
  into v_percent, v_unit_count, v_all_done
  from (
    select avg(p.percent) as unit_percent, bool_and(p.status = 'done') as unit_done
    from public.project_stage_progress p
    where p.project_id = p_project_id
      and (case when v_has_sections then p.section_id is not null else p.section_id is null end)
    group by p.section_id
  ) units;

  select exists (
    select 1 from public.project_stage_progress p
    where p.project_id = p_project_id and p.status <> 'not_started'
  ) into v_activity;

  select l.team_leader_personnel_id, l.team_leader_name
  into v_last_log
  from public.project_stage_logs l
  join public.project_stage_progress p on p.id = l.progress_id
  where p.project_id = p_project_id and l.team_leader_name is not null
  order by l.log_date desc, l.created_at desc
  limit 1;

  update public.projects
  set
    progress_percent = case when v_unit_count = 0 then 0 else round(v_percent)::integer end,
    has_activity = v_activity,
    current_team_leader_personnel_id = coalesce(v_last_log.team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_last_log.team_leader_name, current_team_leader_name),
    -- Planlanan imalatlar bitince proje kendiliğinden tamamlanmaz; "tamamlansın mı?" diye sorulur.
    completion_ready = v_unit_count > 0 and v_all_done and status not in ('completed', 'on_hold'),
    -- Elle tamamlanmış proje, bir aşama geri alınırsa yeniden açılır.
    status = case
      when status = 'completed' and v_unit_count > 0 and not v_all_done then 'in_progress'::public.project_status
      else status
    end,
    completed_by_personnel_id = case
      when v_unit_count > 0 and v_all_done then coalesce(v_last_log.team_leader_personnel_id, completed_by_personnel_id)
      else completed_by_personnel_id end,
    completed_by_name = case
      when v_unit_count > 0 and v_all_done then coalesce(v_last_log.team_leader_name, completed_by_name)
      else completed_by_name end
  where id = p_project_id;
end;
$$;
