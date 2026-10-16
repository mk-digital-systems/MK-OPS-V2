-- Pafta bazlı keşif (HP projesi)
--
--   * Her paftaya poz + miktar olarak keşif girilir (project_sheet_kesif). Projedeki poz satırının hedefi
--     paftaların toplamıdır; böylece mevcut ilerleme hesapları aynen çalışır.
--   * HP projesinde imalat girilince proje "Devam ediyor" olur, ilerleme keşiften hesaplanır (keşif yoksa
--     paftalardan), keşif bitince "projeyi tamamlayalım mı?" diye sorulur.

-- Pafta iptal edilebilir: iptal paftalar proje toplamlarından ve HP raporundan düşer, "İptal" alanında görünür.
alter table public.project_hp_sheets drop constraint project_hp_sheets_status_check;
alter table public.project_hp_sheets add constraint project_hp_sheets_status_check
  check (status in ('not_started', 'permit_waiting', 'in_progress', 'completed', 'cancelled'));

create table public.project_sheet_kesif (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  sheet_id uuid not null,
  progress_id uuid not null,
  target_quantity numeric(14, 3) not null check (target_quantity > 0),
  created_at timestamptz not null default now(),
  constraint project_sheet_kesif_unique unique (sheet_id, progress_id),
  constraint project_sheet_kesif_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade,
  constraint project_sheet_kesif_sheet_fkey foreign key (company_id, sheet_id)
    references public.project_hp_sheets (company_id, id) on delete cascade,
  constraint project_sheet_kesif_progress_fkey foreign key (progress_id)
    references public.project_stage_progress (id) on delete cascade
);
create index idx_project_sheet_kesif_project on public.project_sheet_kesif (project_id);

comment on table public.project_sheet_kesif is 'HP projesinde paftaya göre keşif (poz + miktar)';

alter table public.project_sheet_kesif enable row level security;
revoke all on public.project_sheet_kesif from anon;

create policy "company_isolation" on public.project_sheet_kesif
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy branch_isolation on public.project_sheet_kesif
  as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id))
  with check (exists (select 1 from public.projects p where p.id = project_id));
create policy "project_sheet_kesif_select" on public.project_sheet_kesif for select to authenticated
  using ((select public.can_view_all()) or (select public.has_module_write_permission('projects')));

-- Yazma yalnızca save_sheet_kesif ile.

-- p_items: [{ "sheet_id": uuid, "stage_id": uuid, "quantity": number }, …]; projenin bütün pafta keşfi bununla değişir.
create function public.save_sheet_kesif(p_project_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_item jsonb;
  v_sheet uuid;
  v_progress uuid;
  v_qty numeric;
  v_keep uuid[] := '{}';
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje düzenleme yetkiniz yok' using errcode = '42501';
  end if;
  select * into v_project from public.projects
  where id = p_project_id and company_id = public.current_company_id()
  for update;
  if not found then
    raise exception 'Proje bulunamadı';
  end if;
  if not public.can_access_branch(v_project.branch_id) then
    raise exception 'Bu kayıt erişiminiz olmayan bir şubeye ait' using errcode = '42501';
  end if;
  if v_project.is_archived or v_project.is_cancelled then
    raise exception 'Arşivdeki veya iptal edilen projenin keşfi değiştirilemez';
  end if;
  if not exists (select 1 from public.project_types t where t.id = v_project.project_type_id and t.screen = 'hp') then
    raise exception 'Pafta keşfi yalnızca HP odaklı projede girilir';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'Geçersiz keşif listesi';
  end if;

  delete from public.project_sheet_kesif where project_id = p_project_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sheet := nullif(v_item ->> 'sheet_id', '')::uuid;
    v_qty := nullif(trim(coalesce(v_item ->> 'quantity', '')), '')::numeric;
    if not exists (select 1 from public.project_hp_sheets where id = v_sheet and project_id = p_project_id) then
      raise exception 'Pafta bu projede değil';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception '% için keşif miktarı sıfırdan büyük olmalı',
        (select name from public.project_type_stages where id = (v_item ->> 'stage_id')::uuid);
    end if;
    v_progress := public.ensure_project_poz_row(p_project_id, nullif(v_item ->> 'stage_id', '')::uuid);
    if exists (select 1 from public.project_sheet_kesif where sheet_id = v_sheet and progress_id = v_progress) then
      raise exception 'Aynı poz bir paftanın keşfinde iki kez var';
    end if;
    insert into public.project_sheet_kesif (company_id, project_id, sheet_id, progress_id, target_quantity)
    values (v_project.company_id, p_project_id, v_sheet, v_progress, v_qty);
    v_keep := v_keep || v_progress;
  end loop;

  -- Projedeki poz satırının hedefi = paftalardaki keşiflerin toplamı.
  update public.project_stage_progress sp
  set target_quantity = (select sum(k.target_quantity) from public.project_sheet_kesif k where k.progress_id = sp.id)
  where sp.id = any (v_keep);

  update public.project_stage_progress sp
  set target_quantity = null,
      status = case when exists (select 1 from public.project_stage_logs l where l.progress_id = sp.id)
                    then 'in_progress' else 'not_started' end
  where sp.project_id = p_project_id and sp.target_quantity is not null and not (sp.id = any (v_keep));

  delete from public.project_stage_progress sp
  where sp.project_id = p_project_id and sp.target_quantity is null and not (sp.id = any (v_keep))
    and not exists (select 1 from public.project_stage_logs l where l.progress_id = sp.id)
    and exists (select 1 from public.project_type_stages st where st.id = sp.stage_id and st.project_type_id is null);

  perform public.refresh_project_rollup(p_project_id);
end;
$$;

revoke all on function public.save_sheet_kesif(uuid, jsonb) from public, anon;
grant execute on function public.save_sheet_kesif(uuid, jsonb) to authenticated;

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
  v_hp boolean;
begin
  select exists (
    select 1 from public.projects p join public.project_types t on t.id = p.project_type_id
    where p.id = p_project_id and t.screen = 'hp'
  ) into v_hp;

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
    progress_percent = case when v_kesif = 0 then (case when v_hp then progress_percent else 0 end) else round(v_percent)::integer end,
    has_activity = has_activity or v_activity,
    completion_ready = v_kesif > 0 and v_kesif_done and status not in ('completed', 'on_hold'),
    current_team_leader_personnel_id = coalesce(v_last_log.team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_last_log.team_leader_name, current_team_leader_name)
  where id = p_project_id;
end;
$$;

create or replace function public.refresh_hp_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  c_auto_hold constant text := 'Kazı izni bekleniyor';
  v_project public.projects;
  v_total integer;
  v_done integer;
  v_in_progress boolean;
  v_permit boolean;
  v_activity boolean;
  v_last_done date;
  v_finisher record;
  v_leader record;
  v_manual_hold boolean;
  v_status public.project_status;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then return; end if;
  if not exists (
    select 1 from public.project_types t where t.id = v_project.project_type_id and t.screen = 'hp'
  ) then
    return;
  end if;

  select count(*),
         count(*) filter (where status = 'completed'),
         coalesce(bool_or(status = 'in_progress'), false),
         coalesce(bool_or(status = 'permit_waiting'), false),
         coalesce(bool_or(status in ('in_progress', 'completed')), false),
         max(completed_at)
  into v_total, v_done, v_in_progress, v_permit, v_activity, v_last_done
  from public.project_hp_sheets
  where project_id = p_project_id and status <> 'cancelled';

  select completed_by_personnel_id, completed_by_name into v_finisher
  from public.project_hp_sheets
  where project_id = p_project_id and status = 'completed'
  order by completed_at desc, updated_at desc
  limit 1;

  select current_team_leader_personnel_id, current_team_leader_name into v_leader
  from public.project_hp_sheets
  where project_id = p_project_id and status = 'in_progress'
  order by updated_at desc
  limit 1;

  v_manual_hold := v_project.status = 'on_hold' and v_project.hold_reason is distinct from c_auto_hold;
  v_status := case
    when v_total > 0 and v_done = v_total then 'completed'::public.project_status
    when v_manual_hold then 'on_hold'::public.project_status
    when v_in_progress then 'waiting'::public.project_status
    when v_permit then 'on_hold'::public.project_status
    else 'waiting'::public.project_status
  end;

  update public.projects
  set
    status = v_status,
    hold_reason = case
      when v_status <> 'on_hold' then null
      when v_manual_hold then hold_reason
      else c_auto_hold end,
    has_activity = v_activity,
    progress_percent = case
      when v_total = 0 then 0
      when v_done = v_total then 100
      else least(99, round(v_done * 100.0 / v_total))::integer end,
    completed_at = case when v_status = 'completed' then v_last_done end,
    completed_by_personnel_id = case when v_status = 'completed' then v_finisher.completed_by_personnel_id end,
    completed_by_name = case when v_status = 'completed' then v_finisher.completed_by_name end,
    current_team_leader_personnel_id = coalesce(v_leader.current_team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_leader.current_team_leader_name, current_team_leader_name)
  where id = p_project_id;

  -- Pafta bazlı keşif ve imalatlar: ilerleme keşiften, etkinlik imalattan, tamamlama sorusu keşiften gelir.
  perform public.refresh_poz_project(p_project_id);
end;
$$;

create or replace function public.hp_report(p_from date, p_to date, p_branch_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sheets as (
    select s.*, p.project_code, p.name as project_name, p.status as project_status,
           p.branch_id, p.is_archived
    from public.project_hp_sheets s
    join public.projects p on p.id = s.project_id
    where not p.is_cancelled and s.status <> 'cancelled'
      and (p_branch_id is null or p.branch_id = p_branch_id)
  ),
  in_period as (
    select * from sheets
    where status = 'completed' and completed_at between p_from and p_to
  ),
  per_project as (
    select
      project_id as id, project_code, project_name as name, project_status as status, branch_id, is_archived,
      count(*) as sheet_count,
      count(*) filter (where status = 'completed') as completed_sheets,
      coalesce(sum(hp_count), 0) as total_hp,
      coalesce(sum(hp_count) filter (where status = 'completed'), 0) as completed_hp,
      coalesce(sum(hp_count) filter (where status = 'completed' and completed_at between p_from and p_to), 0) as period_hp,
      count(*) filter (where status = 'completed' and completed_at between p_from and p_to) as period_sheets,
      max(completed_at) as last_completed_at
    from sheets
    group by project_id, project_code, project_name, project_status, branch_id, is_archived
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'projects', count(*),
        'completed_projects', count(*) filter (where completed_sheets = sheet_count),
        'sheets', coalesce(sum(sheet_count), 0),
        'completed_sheets', coalesce(sum(completed_sheets), 0),
        'total_hp', coalesce(sum(total_hp), 0),
        'completed_hp', coalesce(sum(completed_hp), 0),
        'period_hp', coalesce(sum(period_hp), 0),
        'period_sheets', coalesce(sum(period_sheets), 0),
        'period_completed_projects', count(*) filter (
          where completed_sheets = sheet_count and last_completed_at between p_from and p_to)
      )
      from per_project
    ),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(pp) order by pp.period_hp desc, pp.last_completed_at desc nulls last, pp.project_code)
      from per_project pp
    ), '[]'::jsonb),
    'period_sheets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ip.id,
        'sheet_no', ip.sheet_no,
        'hp_count', ip.hp_count,
        'address', ip.address,
        'completed_at', ip.completed_at,
        'completed_by_name', ip.completed_by_name,
        'project_id', ip.project_id,
        'project_code', ip.project_code,
        'project_name', ip.project_name
      ) order by ip.completed_at desc, ip.project_code, ip.sheet_no)
      from (select * from in_period order by completed_at desc limit 1000) ip
    ), '[]'::jsonb)
  );
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
  -- HP projesi paftalardan (refresh_hp_project) hesaplanır; keşif / imalat ilerlemesi oradan eklenir.
  if v_screen = 'hp' then
    perform public.refresh_hp_project(p_project_id);
    return;
  end if;
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
