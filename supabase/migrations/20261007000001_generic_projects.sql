-- =============================================================================
-- MK OPS — sektörden bağımsız proje modeli
--
-- Telekoma özel yapı (BGFD kabinleri, HP paftaları, kablo/ek/OBK/kazı alanları,
-- sabit proje türleri) kaldırılır. Yerine:
--   * project_types        firma kendi proje türlerini tanımlar
--   * project_type_stages  her türün sıralı aşamaları (isteğe bağlı birim: m, m², adet…)
--   * project_sections     isteğe bağlı bölümler (blok, etap, hat…)
--   * project_stage_progress  proje/bölüm × aşama ilerlemesi (durum, hedef miktar)
--   * project_stage_logs   ekiplerin girdiği iş/miktar kayıtları
-- Proje ilerleme yüzdesi ve durumu bu kayıtlardan otomatik hesaplanır.
-- =============================================================================

-- 0. Ön koşul: telekom proje verisi taşınmaz --------------------------------------
do $$
begin
  if exists (select 1 from public.projects) then
    raise exception 'Mevcut proje kayıtları var; genel proje modeline geçiş boş proje tablosu gerektirir';
  end if;
end $$;

-- 1. Telekoma özel yapıyı kaldır ---------------------------------------------------
drop trigger if exists projects_derive_automatic_status on public.projects;
drop trigger if exists projects_require_all_children_completed on public.projects;
drop trigger if exists projects_set_completion_owner on public.projects;

drop table public.project_sheet_progress;
drop table public.project_sheet_cables;
drop table public.project_cabinet_progress;
drop table public.project_sheets;
drop table public.project_cabinets;

drop function public.bulk_update_project_tracking(jsonb);
drop function public.create_hp_project_with_sheets(jsonb, jsonb);
drop function public.projects_derive_automatic_status();
drop function public.recalculate_project_sheet_completion(uuid, date);
drop function public.refresh_bgfd_cabinet_completion();
drop function public.refresh_bgfd_project_status();
drop function public.refresh_hp_focused_project();
drop function public.refresh_sheet_completion_from_cable();
drop function public.refresh_sheet_completion_from_progress();
drop function public.refresh_sheet_completion_from_tracking();
drop function public.require_all_project_children_completed();
drop function public.set_bgfd_current_team_leader();
drop function public.set_project_completion_owner();
drop function public.validate_bgfd_transfer();
drop function public.validate_sheet_progress_quantity();
drop function public.get_dashboard_overview();

alter table public.projects
  drop column default_status_sort_order,
  drop column project_type_sort_order,
  drop column project_type,
  drop column cable_pulled,
  drop column joint_done,
  drop column tracks_obk,
  drop column obk_pulled,
  drop column tracks_joint,
  drop column tracks_cable,
  drop column tracks_excavation,
  drop column excavation_done,
  drop column sheet_count,
  drop column hp_count,
  drop column is_single_sheet;

-- "Kazı izni bekliyor" genel "Beklemede" durumuna dönüşür.
alter type public.project_status rename value 'excavation_permit_waiting' to 'on_hold';
alter table public.projects rename column excavation_permit_waiting_at to on_hold_at;

-- 2. Proje türleri ve aşamaları ------------------------------------------------------
create table public.project_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  has_sections boolean not null default false,
  section_label text not null default 'Bölüm' check (char_length(trim(section_label)) between 2 and 30),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_types_company_id_id_key unique (company_id, id)
);
create unique index project_types_company_name_unique on public.project_types (company_id, lower(trim(name)));
create index idx_project_types_company_id on public.project_types (company_id);

comment on table public.project_types is 'Firmanın tanımladığı proje türleri (ör. Konut inşaatı, Doğalgaz hattı)';
comment on column public.project_types.has_sections is 'Projeler bölümlere (blok, etap, hat…) ayrılır mı';
comment on column public.project_types.section_label is 'Bölümlerin adı (Bölüm, Blok, Etap, Hat…)';

create table public.project_type_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  project_type_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  unit text check (unit is null or char_length(trim(unit)) between 1 and 12),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint project_type_stages_company_id_id_key unique (company_id, id),
  constraint project_type_stages_type_fkey foreign key (company_id, project_type_id)
    references public.project_types (company_id, id) on delete cascade
);
create unique index project_type_stages_name_unique on public.project_type_stages (project_type_id, lower(trim(name)));
create index idx_project_type_stages_company_id on public.project_type_stages (company_id);

comment on table public.project_type_stages is 'Proje türünün sıralı aşamaları; birim girilirse metraj takip edilir';

-- 3. Projeler: tür, bekleme nedeni, etkinlik ------------------------------------------
alter table public.projects
  add column project_type_id uuid not null,
  add column hold_reason text check (hold_reason is null or char_length(hold_reason) <= 500),
  add column has_activity boolean not null default false,
  add constraint projects_project_type_fkey foreign key (company_id, project_type_id)
    references public.project_types (company_id, id) on delete restrict;
create index idx_projects_project_type_id on public.projects (project_type_id);

comment on column public.projects.start_date is 'Planlanan başlangıç';
comment on column public.projects.estimated_end_date is 'Planlanan bitiş; geçilirse proje gecikmiş sayılır';
comment on column public.projects.has_activity is 'Herhangi bir aşamada ilerleme var mı (otomatik)';

-- 4. Bölümler, aşama ilerlemesi ve kayıtlar --------------------------------------------
create table public.project_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  project_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  location text check (location is null or char_length(location) <= 200),
  coordinates text check (coordinates is null or char_length(coordinates) <= 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_sections_company_id_id_key unique (company_id, id),
  constraint project_sections_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade
);
create unique index project_sections_name_unique on public.project_sections (project_id, lower(trim(name)));
create index idx_project_sections_company_id on public.project_sections (company_id);

create table public.project_stage_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  project_id uuid not null,
  section_id uuid,
  stage_id uuid not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  target_quantity numeric(14, 3) check (target_quantity is null or target_quantity > 0),
  done_quantity numeric(14, 3) not null default 0,
  percent numeric(5, 2) not null default 0,
  started_at date,
  completed_at date,
  updated_at timestamptz not null default now(),
  constraint project_stage_progress_company_id_id_key unique (company_id, id),
  constraint project_stage_progress_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade,
  constraint project_stage_progress_section_fkey foreign key (company_id, section_id)
    references public.project_sections (company_id, id) on delete cascade,
  constraint project_stage_progress_stage_fkey foreign key (company_id, stage_id)
    references public.project_type_stages (company_id, id) on delete cascade
);
create unique index project_stage_progress_unique
  on public.project_stage_progress (project_id, coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid), stage_id);
create index idx_project_stage_progress_company_id on public.project_stage_progress (company_id);
create index idx_project_stage_progress_stage on public.project_stage_progress (stage_id);

comment on table public.project_stage_progress is 'Proje (veya bölüm) bazında her aşamanın durumu ve metrajı';

create table public.project_stage_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  progress_id uuid not null,
  log_date date not null default current_date,
  quantity numeric(14, 3) check (quantity is null or quantity > 0),
  team_leader_personnel_id uuid,
  team_leader_name text check (team_leader_name is null or char_length(team_leader_name) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_stage_logs_company_id_id_key unique (company_id, id),
  constraint project_stage_logs_progress_fkey foreign key (company_id, progress_id)
    references public.project_stage_progress (company_id, id) on delete cascade,
  constraint project_stage_logs_team_leader_fkey foreign key (company_id, team_leader_personnel_id)
    references public.personnel (company_id, id) on delete set null (team_leader_personnel_id)
);
create index idx_project_stage_logs_progress on public.project_stage_logs (progress_id, log_date desc);
create index idx_project_stage_logs_company_id on public.project_stage_logs (company_id);

comment on table public.project_stage_logs is 'Aşama için yapılan iş kayıtları (tarih, ekip, miktar, not)';

-- 5. Güvenlik ------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array['project_types', 'project_type_stages', 'project_sections', 'project_stage_progress', 'project_stage_logs']
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon', v_table);
    execute format($p$create policy "company_isolation" on public.%I
      as restrictive for all to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()))$p$, v_table);
    execute format('create trigger a0_enforce_company_scope before insert or update or delete on public.%I
      for each row execute function public.enforce_company_scope()', v_table);
  end loop;

  foreach v_table in array array['project_types', 'project_type_stages']
  loop
    execute format($p$create policy "%s_select_approved" on public.%I for select to authenticated
      using ((select public.current_user_role()) <> 'pending')$p$, v_table, v_table);
    execute format($p$create policy "%s_write_site_chief" on public.%I for all to authenticated
      using ((select public.is_site_chief())) with check ((select public.is_site_chief()))$p$, v_table, v_table);
  end loop;

  foreach v_table in array array['project_sections', 'project_stage_progress', 'project_stage_logs']
  loop
    execute format($p$create policy "%s_select" on public.%I for select to authenticated
      using ((select public.can_view_all()) or (select public.has_module_write_permission('projects')))$p$, v_table, v_table);
    execute format($p$create policy "%s_write" on public.%I for all to authenticated
      using ((select public.has_module_write_permission('projects')))
      with check ((select public.has_module_write_permission('projects')))$p$, v_table, v_table);
  end loop;
end $$;

create trigger project_types_set_updated_at before update on public.project_types
for each row execute function public.set_updated_at();
create trigger project_sections_set_updated_at before update on public.project_sections
for each row execute function public.set_updated_at();

-- 6. İlerleme satırlarını oluşturma -----------------------------------------------------
-- Proje (bölümlüyse her bölüm) × aşama için eksik ilerleme satırlarını ekler.
create function public.sync_project_stage_rows(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_has_sections boolean;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then return; end if;
  select has_sections into v_has_sections from public.project_types where id = v_project.project_type_id;

  if v_has_sections then
    insert into public.project_stage_progress (company_id, project_id, section_id, stage_id)
    select v_project.company_id, v_project.id, s.id, st.id
    from public.project_sections s
    cross join public.project_type_stages st
    where s.project_id = v_project.id
      and st.project_type_id = v_project.project_type_id
    on conflict do nothing;
  else
    insert into public.project_stage_progress (company_id, project_id, section_id, stage_id)
    select v_project.company_id, v_project.id, null, st.id
    from public.project_type_stages st
    where st.project_type_id = v_project.project_type_id
    on conflict do nothing;
  end if;
end;
$$;

-- 7. Hesaplamalar -----------------------------------------------------------------------
-- Aşama satırı: yapılan miktar, otomatik durum ve yüzde.
create function public.compute_stage_progress()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_quantity numeric;
  v_log_count integer;
  v_first_date date;
  v_last_date date;
begin
  select coalesce(sum(quantity), 0), count(*), min(log_date), max(log_date)
  into v_quantity, v_log_count, v_first_date, v_last_date
  from public.project_stage_logs
  where progress_id = new.id;

  new.done_quantity := v_quantity;

  -- Hedef miktara ulaşan aşama tamamlanır; kayıt girilen aşama başlamış sayılır.
  if new.target_quantity is not null and v_quantity >= new.target_quantity then
    new.status := 'done';
  elsif new.status = 'not_started' and v_log_count > 0 then
    new.status := 'in_progress';
  end if;

  if new.status = 'not_started' then
    new.started_at := null;
    new.completed_at := null;
  else
    new.started_at := coalesce(new.started_at, v_first_date, current_date);
    new.completed_at := case when new.status = 'done'
      then coalesce(new.completed_at, v_last_date, current_date) end;
  end if;

  new.percent := case
    when new.status = 'done' then 100
    when new.target_quantity is not null then least(99.99, round(v_quantity / new.target_quantity * 100, 2))
    else 0
  end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger project_stage_progress_compute
before insert or update on public.project_stage_progress
for each row execute function public.compute_stage_progress();

-- Proje: yüzde, etkinlik, sorumlu ekip ve otomatik tamamlanma.
create function public.refresh_project_rollup(p_project_id uuid)
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
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then return; end if;
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
    status = case
      when v_unit_count > 0 and v_all_done and status <> 'on_hold' then 'completed'::public.project_status
      -- Otomatik tamamlanmış proje, bir aşama geri alınırsa yeniden açılır.
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

-- Projenin otomatik durumu: tamamlandı ve beklemede elle/otomatik korunur,
-- diğerleri etkinlik ve planlanan bitişe göre hesaplanır.
create or replace function public.projects_set_stage_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.received_at := coalesce(new.received_at, current_date);
    new.is_archived := false;
    new.archived_at := null;
    new.completed_at := null;
    new.progress_percent := 0;
    new.has_activity := false;
  end if;

  if tg_op = 'UPDATE' and new.project_type_id is distinct from old.project_type_id then
    if exists (
      select 1 from public.project_stage_logs l
      join public.project_stage_progress p on p.id = l.progress_id
      where p.project_id = new.id
    ) then
      raise exception 'İş kaydı girilmiş projenin türü değiştirilemez';
    end if;
  end if;

  if new.status not in ('completed', 'on_hold') then
    new.status := case
      when new.estimated_end_date is not null and new.estimated_end_date < current_date then 'delayed'
      when new.has_activity then 'in_progress'
      else 'waiting'
    end;
  end if;
  if new.status <> 'on_hold' then
    new.hold_reason := null;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    case new.status
      when 'waiting' then new.waiting_at := coalesce(new.waiting_at, current_date);
      when 'in_progress' then new.in_progress_at := coalesce(new.in_progress_at, current_date);
      when 'on_hold' then new.on_hold_at := current_date;
      when 'delayed' then new.delayed_at := coalesce(new.delayed_at, current_date);
      when 'completed' then new.completed_at := coalesce(new.completed_at, current_date);
      else null;
    end case;
  end if;
  if new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_apply_stage_dates on public.projects;
create trigger projects_apply_stage_dates
before insert or update on public.projects
for each row execute function public.projects_set_stage_dates();

-- Planlanan bitişi geçen projeleri "Gecikti" yapar (liste açılırken çağrılır).
create or replace function public.refresh_overdue_project_statuses()
returns integer
language plpgsql
set search_path = public
as $$
declare v_updated integer;
begin
  update public.projects
  set updated_at = updated_at
  where is_archived = false
    and is_cancelled = false
    and status in ('waiting', 'in_progress')
    and estimated_end_date < current_date;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- 8. Tetikleyiciler ---------------------------------------------------------------------
create function public.on_project_change_sync_stages()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' and new.project_type_id is distinct from old.project_type_id then
    delete from public.project_stage_progress where project_id = new.id;
    delete from public.project_sections where project_id = new.id;
  end if;
  if tg_op = 'INSERT' or new.project_type_id is distinct from old.project_type_id then
    perform public.sync_project_stage_rows(new.id);
    perform public.refresh_project_rollup(new.id);
  end if;
  return null;
end;
$$;

create trigger projects_sync_stages
after insert or update of project_type_id on public.projects
for each row execute function public.on_project_change_sync_stages();

create function public.on_section_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_project_stage_rows(new.project_id);
  end if;
  perform public.refresh_project_rollup(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;

create trigger project_sections_sync
after insert or delete on public.project_sections
for each row execute function public.on_section_change();

create function public.on_stage_definition_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
begin
  for v_project_id in
    select id from public.projects
    where project_type_id = coalesce(new.project_type_id, old.project_type_id)
  loop
    if tg_op = 'INSERT' then
      perform public.sync_project_stage_rows(v_project_id);
    end if;
    perform public.refresh_project_rollup(v_project_id);
  end loop;
  return null;
end;
$$;

create trigger project_type_stages_sync
after insert or delete on public.project_type_stages
for each row execute function public.on_stage_definition_change();

create function public.on_stage_progress_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.refresh_project_rollup(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;

create trigger project_stage_progress_rollup
after insert or update or delete on public.project_stage_progress
for each row execute function public.on_stage_progress_change();

-- Kayıt değişince aşama satırı yeniden hesaplanır (o da projeyi günceller).
create function public.on_stage_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.project_stage_progress
  set updated_at = now()
  where id = coalesce(new.progress_id, old.progress_id);
  return null;
end;
$$;

create trigger project_stage_logs_recompute
after insert or update or delete on public.project_stage_logs
for each row execute function public.on_stage_log_change();

-- 9. Proje türü kaydetme (aşamalarla birlikte) -------------------------------------------
-- p_stages: [{ "id": uuid|null, "name": text, "unit": text|null }, ...] sırasıyla.
-- Listede olmayan aşamalar silinir; iş kaydı olan aşama silinemez.
create function public.save_project_type(
  p_id uuid,
  p_name text,
  p_description text,
  p_has_sections boolean,
  p_section_label text,
  p_color text,
  p_stages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_type_id uuid := p_id;
  v_stage jsonb;
  v_index integer := 0;
  v_keep uuid[] := '{}';
  v_stage_id uuid;
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Proje türlerini yalnızca ana yönetici düzenleyebilir' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_stages, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_stages, '[]'::jsonb)) = 0 then
    raise exception 'En az bir aşama tanımlayın';
  end if;

  begin
    if v_type_id is null then
      insert into public.project_types (company_id, name, description, has_sections, section_label, color)
      values (v_company_id, trim(p_name), nullif(trim(p_description), ''), coalesce(p_has_sections, false),
              coalesce(nullif(trim(p_section_label), ''), 'Bölüm'), nullif(trim(p_color), ''))
      returning id into v_type_id;
    else
      update public.project_types
      set name = trim(p_name),
          description = nullif(trim(p_description), ''),
          has_sections = coalesce(p_has_sections, false),
          section_label = coalesce(nullif(trim(p_section_label), ''), 'Bölüm'),
          color = nullif(trim(p_color), '')
      where id = v_type_id and company_id = v_company_id;
      if not found then
        raise exception 'Proje türü bulunamadı';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Bu adla bir proje türü zaten var';
  end;

  -- Önce mevcut aşamaları belirle; silinecekler iş kaydı içermemeli.
  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    if nullif(v_stage->>'id', '') is not null then
      v_keep := v_keep || (v_stage->>'id')::uuid;
    end if;
  end loop;

  if exists (
    select 1
    from public.project_type_stages st
    join public.project_stage_progress p on p.stage_id = st.id
    join public.project_stage_logs l on l.progress_id = p.id
    where st.project_type_id = v_type_id and not (st.id = any (v_keep))
  ) then
    raise exception 'İş kaydı girilmiş bir aşama silinemez';
  end if;

  delete from public.project_type_stages
  where project_type_id = v_type_id and not (id = any (v_keep));

  -- Ad çakışmasını önlemek için önce geçici ad verilir.
  update public.project_type_stages
  set name = id::text
  where project_type_id = v_type_id;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_index := v_index + 1;
    if char_length(trim(coalesce(v_stage->>'name', ''))) = 0 then
      raise exception '%. aşamanın adı boş olamaz', v_index;
    end if;
    v_stage_id := nullif(v_stage->>'id', '')::uuid;
    begin
      if v_stage_id is null then
        insert into public.project_type_stages (company_id, project_type_id, name, unit, sort_order)
        values (v_company_id, v_type_id, trim(v_stage->>'name'), nullif(trim(v_stage->>'unit'), ''), v_index);
      else
        update public.project_type_stages
        set name = trim(v_stage->>'name'), unit = nullif(trim(v_stage->>'unit'), ''), sort_order = v_index
        where id = v_stage_id and project_type_id = v_type_id;
        if not found then
          raise exception 'Aşama bulunamadı';
        end if;
      end if;
    exception
      when unique_violation then
        raise exception 'Aynı adla iki aşama olamaz: %', trim(v_stage->>'name');
    end;
  end loop;

  -- Bölüm ayarı değişmiş olabilir: mevcut projelerin satırlarını tamamla.
  perform public.sync_project_stage_rows(p.id) from public.projects p where p.project_type_id = v_type_id;
  perform public.refresh_project_rollup(p.id) from public.projects p where p.project_type_id = v_type_id;

  return v_type_id;
end;
$$;

create function public.delete_project_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.current_company_id() is null or not public.is_site_chief() then
    raise exception 'Proje türlerini yalnızca ana yönetici düzenleyebilir' using errcode = '42501';
  end if;
  if exists (select 1 from public.projects where project_type_id = p_id) then
    raise exception 'Bu türde projeler var; silmek yerine arşivleyin';
  end if;
  delete from public.project_types where id = p_id and company_id = public.current_company_id();
  if not found then
    raise exception 'Proje türü bulunamadı';
  end if;
end;
$$;

-- 10. Dashboard ---------------------------------------------------------------------------
create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*) filter (where not is_archived and not is_cancelled),
    'waiting', count(*) filter (where not is_archived and not is_cancelled and status = 'waiting'),
    'in_progress', count(*) filter (where not is_archived and not is_cancelled and status = 'in_progress'),
    'on_hold', count(*) filter (where not is_archived and not is_cancelled and status = 'on_hold'),
    'delayed', count(*) filter (where not is_archived and not is_cancelled and status = 'delayed'),
    'completed', count(*) filter (where not is_cancelled and status = 'completed'),
    'archived', count(*) filter (where is_archived),
    'cancelled', count(*) filter (where is_cancelled)
  )
  from public.projects;
$$;

create function public.get_dashboard_overview()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'color', t.color,
        'total', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled),
        'waiting', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'waiting'),
        'in_progress', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'in_progress'),
        'on_hold', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'on_hold'),
        'delayed', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'delayed'),
        'completed', (select count(*) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'completed'),
        'avg_progress', (select coalesce(round(avg(p.progress_percent)), 0) from public.projects p where p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status <> 'completed'),
        'stages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'unit', st.unit,
            'done', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where sp.stage_id = st.id and sp.status = 'done' and not p.is_archived and not p.is_cancelled),
            'in_progress', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where sp.stage_id = st.id and sp.status = 'in_progress' and not p.is_archived and not p.is_cancelled),
            'not_started', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where sp.stage_id = st.id and sp.status = 'not_started' and not p.is_archived and not p.is_cancelled),
            'done_quantity', (select coalesce(sum(sp.done_quantity), 0) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where sp.stage_id = st.id and not p.is_archived and not p.is_cancelled)
          ) order by st.sort_order)
          from public.project_type_stages st where st.project_type_id = t.id
        ), '[]'::jsonb)
      ) order by t.sort_order, t.name)
      from public.project_types t
      where not t.is_archived
    ), '[]'::jsonb),
    'upcoming', coalesce((
      select jsonb_agg(row_to_json(u)::jsonb order by u.estimated_end_date)
      from (
        select p.id, p.project_code, p.name, p.status, p.progress_percent, p.estimated_end_date
        from public.projects p
        where not p.is_archived and not p.is_cancelled and p.status <> 'completed'
          and p.estimated_end_date is not null and p.estimated_end_date <= current_date + 14
        order by p.estimated_end_date
        limit 8
      ) u
    ), '[]'::jsonb),
    'recent_logs', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb order by r.log_date desc, r.created_at desc)
      from (
        select l.id, l.log_date, l.quantity, l.team_leader_name, l.notes, l.created_at,
               st.name as stage_name, st.unit, p.id as project_id, p.project_code, p.name as project_name,
               s.name as section_name
        from public.project_stage_logs l
        join public.project_stage_progress sp on sp.id = l.progress_id
        join public.project_type_stages st on st.id = sp.stage_id
        join public.projects p on p.id = sp.project_id
        left join public.project_sections s on s.id = sp.section_id
        order by l.log_date desc, l.created_at desc
        limit 10
      ) r
    ), '[]'::jsonb)
  );
$$;

-- 11. Yetkiler -----------------------------------------------------------------------------
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'sync_project_stage_rows', 'compute_stage_progress', 'refresh_project_rollup',
        'projects_set_stage_dates', 'refresh_overdue_project_statuses', 'on_project_change_sync_stages',
        'on_section_change', 'on_stage_definition_change', 'on_stage_progress_change', 'on_stage_log_change',
        'save_project_type', 'delete_project_type', 'get_dashboard_stats', 'get_dashboard_overview'
      )
  loop
    execute format('revoke execute on function %s from public, anon', v_function);
  end loop;
end $$;

grant execute on function public.save_project_type(uuid, text, text, boolean, text, text, jsonb) to authenticated;
grant execute on function public.delete_project_type(uuid) to authenticated;
grant execute on function public.refresh_overdue_project_statuses() to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
grant execute on function public.get_dashboard_overview() to authenticated;
