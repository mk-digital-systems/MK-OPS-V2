-- HP odaklı projeler (telekom eklentisi, süper admin açar)
--
--   * project_types.screen  standard (varsayılan, bugünkü aşama ekranı) | hp | corporate
--     HP / kurumsal türlerin aşaması ve bölümü olmaz; ekran tipi sonradan değişmez.
--   * project_hp_sheets     HP projesinin paftaları: pafta no, HP adedi, adres, görsel, not,
--                           durum, mevcut ekip başı, bitiren ekip başı ve bitiş tarihi.
--   * Proje durumu ve ilerlemesi paftalardan hesaplanır (biten pafta / toplam pafta).
--   * HP (home pass) yalnızca bilgidir: iş kalemi değildir, hakedişe girmez. Bitiş tarihine göre
--     genel, proje bazında ve seçilen tarih aralığında tamamlanan HP raporlanır.
--
--   Standart türler ve mevcut proje fonksiyonları değişmez.

-- 1. Proje türünün ekran tipi ---------------------------------------------------------------------
alter table public.project_types
  add column screen text not null default 'standard'
    constraint project_types_screen_check check (screen in ('standard', 'hp', 'corporate'));

comment on column public.project_types.screen is 'Proje ekranı: standard (aşamalar), hp (pafta/HP), corporate (sade kurumsal)';

create function public.guard_project_type_screen()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' and new.screen is distinct from old.screen then
    raise exception 'Proje türünün ekran tipi değiştirilemez';
  end if;
  if new.screen <> 'standard' then
    new.has_sections := false;
    if tg_op = 'INSERT' and public.is_tenant_request() and not public.company_has_project_addon(new.screen) then
      raise exception 'Bu proje eklentisi firmanız için açık değil' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger project_types_guard_screen
before insert or update on public.project_types
for each row execute function public.guard_project_type_screen();

-- HP / kurumsal türlere aşama eklenmez (proje ilerlemesi aşamalardan hesaplanmaz).
create function public.guard_addon_type_stages()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if exists (
    select 1 from public.project_types t
    where t.id = new.project_type_id and t.screen <> 'standard'
  ) then
    raise exception 'HP odaklı ve kurumsal proje türlerinde iş kalemi tanımlanmaz';
  end if;
  return new;
end;
$$;

create trigger project_type_stages_guard_addon
before insert or update of project_type_id on public.project_type_stages
for each row execute function public.guard_addon_type_stages();

-- HP / kurumsal projelerde bölüm olmaz.
create function public.guard_addon_project_sections()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if exists (
    select 1 from public.projects p
    join public.project_types t on t.id = p.project_type_id
    where p.id = new.project_id and t.screen <> 'standard'
  ) then
    raise exception 'Bu projede bölüm kullanılmaz';
  end if;
  return new;
end;
$$;

create trigger project_sections_guard_addon
before insert or update of project_id on public.project_sections
for each row execute function public.guard_addon_project_sections();

-- Eklenti kapalıysa yeni HP / kurumsal proje açılmaz; bu projelerin türü değiştirilemez.
create function public.guard_project_addon_type()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_new_screen text;
  v_old_screen text;
begin
  select screen into v_new_screen from public.project_types where id = new.project_type_id;
  if tg_op = 'INSERT' then
    if v_new_screen <> 'standard' and public.is_tenant_request()
      and not public.company_has_project_addon(v_new_screen) then
      raise exception 'Bu proje eklentisi firmanız için açık değil' using errcode = '42501';
    end if;
  elsif new.project_type_id is distinct from old.project_type_id then
    select screen into v_old_screen from public.project_types where id = old.project_type_id;
    if v_old_screen <> 'standard' or v_new_screen <> 'standard' then
      raise exception 'HP odaklı veya kurumsal projenin türü değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_guard_addon_type
before insert or update of project_type_id on public.projects
for each row execute function public.guard_project_addon_type();

-- 2. Paftalar -----------------------------------------------------------------------------------
create table public.project_hp_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  project_id uuid not null,
  sheet_no text not null check (char_length(trim(sheet_no)) between 1 and 60),
  hp_count integer not null default 0 check (hp_count between 0 and 1000000),
  address text check (address is null or char_length(address) <= 300),
  image_url text check (image_url is null or (char_length(image_url) <= 1000 and image_url ~* '^https?://')),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'not_started'
    check (status in ('not_started', 'permit_waiting', 'in_progress', 'completed')),
  current_team_leader_personnel_id uuid,
  current_team_leader_name text check (current_team_leader_name is null or char_length(current_team_leader_name) <= 120),
  completed_by_personnel_id uuid,
  completed_by_name text check (completed_by_name is null or char_length(completed_by_name) <= 120),
  completed_at date,
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_hp_sheets_company_id_id_key unique (company_id, id),
  constraint project_hp_sheets_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade,
  constraint project_hp_sheets_leader_fkey foreign key (company_id, current_team_leader_personnel_id)
    references public.personnel (company_id, id) on delete set null (current_team_leader_personnel_id),
  constraint project_hp_sheets_finisher_fkey foreign key (company_id, completed_by_personnel_id)
    references public.personnel (company_id, id) on delete set null (completed_by_personnel_id),
  constraint project_hp_sheets_completed_date check (status <> 'completed' or completed_at is not null)
);

create unique index project_hp_sheets_no_unique on public.project_hp_sheets (project_id, lower(trim(sheet_no)));
create index idx_project_hp_sheets_company_id on public.project_hp_sheets (company_id);
create index idx_project_hp_sheets_completed on public.project_hp_sheets (company_id, completed_at)
  where status = 'completed';

comment on table public.project_hp_sheets is 'HP odaklı projenin paftaları; HP (home pass) adedi bilgi amaçlıdır';
comment on column public.project_hp_sheets.completed_at is 'Paftanın bittiği gün; HP raporları bu tarihe göre süzülür';

alter table public.project_hp_sheets enable row level security;
revoke all on public.project_hp_sheets from anon;

create policy "company_isolation" on public.project_hp_sheets
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy branch_isolation on public.project_hp_sheets
  as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id))
  with check (exists (select 1 from public.projects p where p.id = project_id));
create policy "project_hp_sheets_select" on public.project_hp_sheets for select to authenticated
  using ((select public.can_view_all()) or (select public.has_module_write_permission('projects')));
create policy "project_hp_sheets_write" on public.project_hp_sheets for all to authenticated
  using ((select public.has_module_write_permission('projects')))
  with check ((select public.has_module_write_permission('projects')));

create trigger a0_enforce_company_scope before insert or update or delete on public.project_hp_sheets
for each row execute function public.enforce_company_scope();
create trigger project_hp_sheets_set_updated_at before update on public.project_hp_sheets
for each row execute function public.set_updated_at();
create trigger zz_audit_row_change after insert or update or delete on public.project_hp_sheets
for each row execute function public.audit_row_change('projects');

-- Pafta yalnızca HP projesine eklenir; durum dışındaki ekip başı / bitiş alanları temizlenir.
create function public.project_hp_sheets_normalize()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  new.sheet_no := trim(new.sheet_no);
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id then
    if not exists (
      select 1 from public.projects p
      join public.project_types t on t.id = p.project_type_id
      where p.id = new.project_id and t.screen = 'hp'
    ) then
      raise exception 'Pafta yalnızca HP odaklı projeye eklenebilir';
    end if;
  end if;

  if new.status <> 'in_progress' then
    new.current_team_leader_personnel_id := null;
    new.current_team_leader_name := null;
  end if;
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, current_date);
  else
    new.completed_by_personnel_id := null;
    new.completed_by_name := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger project_hp_sheets_normalize
before insert or update on public.project_hp_sheets
for each row execute function public.project_hp_sheets_normalize();

-- 3. Proje durumu paftalardan --------------------------------------------------------------------
-- Bütün paftalar bitti → Tamamlandı (bitiren: son biten paftanın ekip başı, tarih: son bitiş).
-- Elle beklemeye alınmış proje beklemede kalır. Devam eden pafta varsa etkinlik açılır ve
-- durum (Devam ediyor / Gecikti) projects_set_stage_dates'te hesaplanır. Yalnızca kazı izni
-- bekleyen pafta varsa proje "Kazı izni bekleniyor" nedeniyle beklemeye düşer.
create function public.refresh_hp_project(p_project_id uuid)
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
  where project_id = p_project_id;

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
end;
$$;

create function public.on_hp_sheet_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.refresh_hp_project(coalesce(new.project_id, old.project_id));
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    perform public.refresh_hp_project(old.project_id);
  end if;
  return null;
end;
$$;

create trigger project_hp_sheets_rollup
after insert or update or delete on public.project_hp_sheets
for each row execute function public.on_hp_sheet_change();

-- 4. HP / kurumsal türü kaydetme (aşamasız) -------------------------------------------------------
create function public.save_addon_project_type(
  p_id uuid,
  p_name text,
  p_description text,
  p_color text,
  p_screen text
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
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Proje türlerini yalnızca firma yöneticisi düzenleyebilir' using errcode = '42501';
  end if;
  if p_screen not in ('hp', 'corporate') then
    raise exception 'Geçersiz proje ekranı';
  end if;

  begin
    if v_type_id is null then
      if not public.company_has_project_addon(p_screen) then
        raise exception 'Bu proje eklentisi firmanız için açık değil' using errcode = '42501';
      end if;
      insert into public.project_types (company_id, name, description, color, screen, has_sections)
      values (v_company_id, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_color), ''), p_screen, false)
      returning id into v_type_id;
    else
      update public.project_types
      set name = trim(p_name),
          description = nullif(trim(p_description), ''),
          color = nullif(trim(p_color), '')
      where id = v_type_id and company_id = v_company_id and screen = p_screen;
      if not found then
        raise exception 'Proje türü bulunamadı';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Bu adla bir proje türü zaten var';
  end;

  return v_type_id;
end;
$$;

-- 5. HP projesini paftalarıyla birlikte açma ------------------------------------------------------
-- p_project: projects satırı alanları (project_code, name, project_type_id, location, …)
-- p_sheets:  [{ "sheet_no", "hp_count", "address", "image_url", "notes" }, …] sırasıyla
create function public.create_hp_project(p_project jsonb, p_sheets jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.projects := jsonb_populate_record(null::public.projects, p_project);
  v_count integer;
  v_project_id uuid;
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje oluşturma yetkiniz yok' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_types t where t.id = v_row.project_type_id and t.screen = 'hp') then
    raise exception 'Seçilen proje türü HP odaklı değil';
  end if;
  if jsonb_typeof(coalesce(p_sheets, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_sheets) = 0 then
    raise exception 'En az bir pafta girin';
  end if;
  v_count := jsonb_array_length(p_sheets);
  if v_count > 500 then
    raise exception 'Bir projede en fazla 500 pafta olabilir';
  end if;
  if exists (select 1 from jsonb_array_elements(p_sheets) e where trim(coalesce(e ->> 'sheet_no', '')) = '') then
    raise exception 'Her pafta için pafta numarası girin';
  end if;
  if (select count(distinct lower(trim(e ->> 'sheet_no'))) from jsonb_array_elements(p_sheets) e) <> v_count then
    raise exception 'Aynı pafta numarası bir projede birden fazla kullanılamaz';
  end if;

  insert into public.projects (
    project_code, name, project_type_id, location, team_name, description, image_url,
    received_at, start_date, estimated_end_date, priority_order, branch_id, created_by, updated_by
  )
  values (
    v_row.project_code, v_row.name, v_row.project_type_id, v_row.location, v_row.team_name, v_row.description,
    v_row.image_url, v_row.received_at, v_row.start_date, v_row.estimated_end_date, v_row.priority_order,
    v_row.branch_id, auth.uid(), auth.uid()
  )
  returning id into v_project_id;

  insert into public.project_hp_sheets (project_id, sheet_no, hp_count, address, image_url, notes, sort_order)
  select v_project_id,
         trim(x.e ->> 'sheet_no'),
         coalesce(nullif(trim(x.e ->> 'hp_count'), '')::integer, 0),
         nullif(trim(x.e ->> 'address'), ''),
         nullif(trim(x.e ->> 'image_url'), ''),
         nullif(trim(x.e ->> 'notes'), ''),
         x.ord
  from jsonb_array_elements(p_sheets) with ordinality as x(e, ord);

  return v_project_id;
end;
$$;

-- 6. HP raporu ----------------------------------------------------------------------------------
-- İptal edilmemiş HP projeleri (arşivdekiler dahil). Dönem: paftanın bitiş tarihi p_from–p_to.
-- Kullanıcının yetkisiyle çalışır: görebildiği şubeler ve projeler.
create function public.hp_report(p_from date, p_to date, p_branch_id uuid default null)
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
    where not p.is_cancelled
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

-- 7. Yetkiler -----------------------------------------------------------------------------------
revoke all on function public.guard_project_type_screen() from public, anon, authenticated;
revoke all on function public.guard_addon_type_stages() from public, anon, authenticated;
revoke all on function public.guard_addon_project_sections() from public, anon, authenticated;
revoke all on function public.guard_project_addon_type() from public, anon, authenticated;
revoke all on function public.project_hp_sheets_normalize() from public, anon, authenticated;
revoke all on function public.on_hp_sheet_change() from public, anon, authenticated;
revoke all on function public.refresh_hp_project(uuid) from public, anon, authenticated;

revoke all on function public.save_addon_project_type(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_addon_project_type(uuid, text, text, text, text) to authenticated;
revoke all on function public.create_hp_project(jsonb, jsonb) from public, anon;
grant execute on function public.create_hp_project(jsonb, jsonb) to authenticated;
revoke all on function public.hp_report(date, date, uuid) from public, anon;
grant execute on function public.hp_report(date, date, uuid) to authenticated;
