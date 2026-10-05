-- =============================================================================
-- 00019 — Şirket yöneticileri için alan bazlı işlem yetkileri
-- 00018'den sonra çalıştırılmalıdır.
-- Tüm yetkiler varsayılan olarak kapalıdır.
-- =============================================================================

create table if not exists public.company_manager_permissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  projects_write boolean not null default false,
  work_plans_write boolean not null default false,
  personnel_write boolean not null default false,
  attendance_write boolean not null default false,
  vehicles_write boolean not null default false,
  inventory_write boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.company_manager_permissions is
  'Şirket yöneticilerinin alan bazlı işlem yetkileri; varsayılan salt okunur';

drop trigger if exists company_manager_permissions_set_updated_at
  on public.company_manager_permissions;
create trigger company_manager_permissions_set_updated_at
before update on public.company_manager_permissions
for each row execute function public.set_updated_at();

alter table public.company_manager_permissions enable row level security;
grant select on public.company_manager_permissions to authenticated;

drop policy if exists "company_manager_permissions_select"
  on public.company_manager_permissions;
create policy "company_manager_permissions_select"
  on public.company_manager_permissions for select
  to authenticated
  using (user_id = auth.uid() or public.is_site_chief());

-- Mevcut şirket yöneticileri için kapalı izin kaydı oluştur.
insert into public.company_manager_permissions (user_id)
select id
from public.profiles
where role = 'company_manager' and is_approved = true
on conflict (user_id) do nothing;

create or replace function public.has_module_write_permission(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when public.current_user_role() = 'site_chief' then true
    when public.current_user_role() <> 'company_manager' then false
    else coalesce((
      select case p_module
        when 'projects' then cmp.projects_write
        when 'work_plans' then cmp.work_plans_write
        when 'personnel' then cmp.personnel_write
        when 'attendance' then cmp.attendance_write
        when 'vehicles' then cmp.vehicles_write
        when 'inventory' then cmp.inventory_write
        else false
      end
      from public.company_manager_permissions cmp
      where cmp.user_id = auth.uid()
    ), false)
  end;
$$;

revoke all on function public.has_module_write_permission(text) from public;
grant execute on function public.has_module_write_permission(text)
  to authenticated;

create or replace function public.set_company_manager_permission(
  p_user_id uuid,
  p_module text,
  p_enabled boolean
)
returns public.company_manager_permissions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_permissions public.company_manager_permissions;
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  if p_module not in (
    'projects', 'work_plans', 'personnel',
    'attendance', 'vehicles', 'inventory'
  ) then
    raise exception 'Geçersiz yetki alanı';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and role = 'company_manager'
      and is_approved = true
  ) then
    raise exception 'Kullanıcı onaylı bir şirket yöneticisi değil';
  end if;

  insert into public.company_manager_permissions (user_id, updated_by)
  values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;

  update public.company_manager_permissions
  set
    projects_write = case
      when p_module = 'projects' then p_enabled else projects_write end,
    work_plans_write = case
      when p_module = 'work_plans' then p_enabled else work_plans_write end,
    personnel_write = case
      when p_module = 'personnel' then p_enabled else personnel_write end,
    attendance_write = case
      when p_module = 'attendance' then p_enabled else attendance_write end,
    vehicles_write = case
      when p_module = 'vehicles' then p_enabled else vehicles_write end,
    inventory_write = case
      when p_module = 'inventory' then p_enabled else inventory_write end,
    updated_by = auth.uid()
  where user_id = p_user_id
  returning * into v_permissions;

  return v_permissions;
end;
$$;

revoke all on function public.set_company_manager_permission(
  uuid, text, boolean
) from public;
grant execute on function public.set_company_manager_permission(
  uuid, text, boolean
) to authenticated;

-- Rol atamasında şirket yöneticisi izinleri kapalı başlatılır.
create or replace function public.assign_user_role(
  p_user_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_manager_count integer;
  v_accounting_count integer;
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('azg-role-assignment'));
  if p_user_id = auth.uid() then
    raise exception 'Şantiye şefi kendi yetkisini değiştiremez';
  end if;
  if p_role not in ('company_manager', 'accounting', 'pending') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  if p_role = 'company_manager' then
    select count(*)::integer into v_manager_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and id <> p_user_id;
    if v_manager_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if p_role = 'accounting' then
    select count(*)::integer into v_accounting_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and id <> p_user_id;
    if v_accounting_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  update public.profiles
  set
    role = p_role,
    is_approved = p_role <> 'pending',
    approved_at = case when p_role <> 'pending' then now() else null end,
    approved_by = case when p_role <> 'pending' then auth.uid() else null end
  where id = p_user_id and role <> 'site_chief'
  returning * into v_profile;
  if not found then
    raise exception 'Kullanıcı bulunamadı veya rolü değiştirilemez';
  end if;

  if p_role = 'company_manager' then
    insert into public.company_manager_permissions (user_id, updated_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.company_manager_permissions where user_id = p_user_id;
  end if;

  return v_profile;
end;
$$;

-- Proje yazma politikaları
drop policy if exists "projects_insert_site_chief" on public.projects;
drop policy if exists "projects_update_site_chief" on public.projects;
drop policy if exists "projects_delete_site_chief" on public.projects;
create policy "projects_insert_module_writer"
  on public.projects for insert to authenticated
  with check (public.has_module_write_permission('projects'));
create policy "projects_update_module_writer"
  on public.projects for update to authenticated
  using (public.has_module_write_permission('projects'))
  with check (public.has_module_write_permission('projects'));
create policy "projects_delete_module_writer"
  on public.projects for delete to authenticated
  using (public.has_module_write_permission('projects'));

-- İş planı yazma politikaları
drop policy if exists "dwp_insert_site_chief" on public.daily_work_plans;
drop policy if exists "dwp_update_site_chief" on public.daily_work_plans;
drop policy if exists "dwp_delete_site_chief" on public.daily_work_plans;
create policy "dwp_insert_module_writer"
  on public.daily_work_plans for insert to authenticated
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_update_module_writer"
  on public.daily_work_plans for update to authenticated
  using (public.has_module_write_permission('work_plans'))
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_delete_module_writer"
  on public.daily_work_plans for delete to authenticated
  using (public.has_module_write_permission('work_plans'));

drop policy if exists "dwp_teams_insert_site_chief"
  on public.daily_work_plan_teams;
drop policy if exists "dwp_teams_update_site_chief"
  on public.daily_work_plan_teams;
drop policy if exists "dwp_teams_delete_site_chief"
  on public.daily_work_plan_teams;
create policy "dwp_teams_insert_module_writer"
  on public.daily_work_plan_teams for insert to authenticated
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_teams_update_module_writer"
  on public.daily_work_plan_teams for update to authenticated
  using (public.has_module_write_permission('work_plans'))
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_teams_delete_module_writer"
  on public.daily_work_plan_teams for delete to authenticated
  using (public.has_module_write_permission('work_plans'));

drop policy if exists "dwp_members_insert_site_chief"
  on public.daily_work_plan_team_members;
drop policy if exists "dwp_members_update_site_chief"
  on public.daily_work_plan_team_members;
drop policy if exists "dwp_members_delete_site_chief"
  on public.daily_work_plan_team_members;
create policy "dwp_members_insert_module_writer"
  on public.daily_work_plan_team_members for insert to authenticated
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_members_update_module_writer"
  on public.daily_work_plan_team_members for update to authenticated
  using (public.has_module_write_permission('work_plans'))
  with check (public.has_module_write_permission('work_plans'));
create policy "dwp_members_delete_module_writer"
  on public.daily_work_plan_team_members for delete to authenticated
  using (public.has_module_write_permission('work_plans'));

-- Personel ve puantaj yazma politikaları
drop policy if exists "personnel_insert_site_chief" on public.personnel;
drop policy if exists "personnel_update_site_chief" on public.personnel;
drop policy if exists "personnel_delete_site_chief" on public.personnel;
create policy "personnel_insert_module_writer"
  on public.personnel for insert to authenticated
  with check (public.has_module_write_permission('personnel'));
create policy "personnel_update_module_writer"
  on public.personnel for update to authenticated
  using (public.has_module_write_permission('personnel'))
  with check (public.has_module_write_permission('personnel'));
create policy "personnel_delete_module_writer"
  on public.personnel for delete to authenticated
  using (public.has_module_write_permission('personnel'));

drop policy if exists "attendance_insert_site_chief"
  on public.attendance_records;
drop policy if exists "attendance_update_site_chief"
  on public.attendance_records;
drop policy if exists "attendance_delete_site_chief"
  on public.attendance_records;
create policy "attendance_insert_module_writer"
  on public.attendance_records for insert to authenticated
  with check (public.has_module_write_permission('attendance'));
create policy "attendance_update_module_writer"
  on public.attendance_records for update to authenticated
  using (public.has_module_write_permission('attendance'))
  with check (public.has_module_write_permission('attendance'));
create policy "attendance_delete_module_writer"
  on public.attendance_records for delete to authenticated
  using (public.has_module_write_permission('attendance'));

-- Araç yazma politikaları
drop policy if exists "vehicles_insert_site_chief" on public.vehicles;
drop policy if exists "vehicles_update_site_chief" on public.vehicles;
create policy "vehicles_insert_module_writer"
  on public.vehicles for insert to authenticated
  with check (public.has_module_write_permission('vehicles'));
create policy "vehicles_update_module_writer"
  on public.vehicles for update to authenticated
  using (public.has_module_write_permission('vehicles'))
  with check (public.has_module_write_permission('vehicles'));

-- Stok SECURITY DEFINER fonksiyonlarında alan yetkisi kontrolü.
create or replace function public.create_inventory_material(
  p_material_name text,
  p_material_code text,
  p_unit public.inventory_unit,
  p_initial_quantity numeric,
  p_notes text default null
)
returns public.inventory_materials
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_material_name, ''))) < 2 then
    raise exception 'Malzeme cinsi zorunlu';
  end if;
  if p_initial_quantity is null or p_initial_quantity <= 0 then
    raise exception 'Başlangıç miktarı sıfırdan büyük olmalıdır';
  end if;
  if p_unit = 'piece' and p_initial_quantity <> trunc(p_initial_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  insert into public.inventory_materials (
    material_code, material_name, unit, stock_quantity, notes,
    created_by, updated_by
  )
  values (
    nullif(trim(p_material_code), ''), trim(p_material_name), p_unit,
    p_initial_quantity, nullif(trim(p_notes), ''), auth.uid(), auth.uid()
  )
  returning * into v_material;
  insert into public.inventory_movements (
    material_id, movement_type, quantity, description,
    balance_after, created_by
  )
  values (
    v_material.id, 'in', p_initial_quantity, 'İlk stok girişi',
    p_initial_quantity, auth.uid()
  );
  return v_material;
end;
$$;

create or replace function public.record_inventory_movement(
  p_material_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_usage_location text default null,
  p_description text default null
)
returns public.inventory_materials
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_new_balance numeric(14, 3);
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli'
      using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır';
  end if;
  select * into v_material
  from public.inventory_materials
  where id = p_material_id
  for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;
  if p_movement_type = 'out'
    and char_length(trim(coalesce(p_usage_location, ''))) < 2 then
    raise exception 'Kullanım yeri zorunlu';
  end if;
  v_new_balance := case
    when p_movement_type = 'in'
      then v_material.stock_quantity + p_quantity
    else v_material.stock_quantity - p_quantity
  end;
  if v_new_balance < 0 then
    raise exception 'Yetersiz stok. Mevcut: %', v_material.stock_quantity;
  end if;
  update public.inventory_materials
  set stock_quantity = v_new_balance, updated_by = auth.uid()
  where id = p_material_id
  returning * into v_material;
  insert into public.inventory_movements (
    material_id, movement_type, quantity, usage_location,
    description, balance_after, created_by
  )
  values (
    p_material_id, p_movement_type, p_quantity,
    case when p_movement_type = 'out' then trim(p_usage_location) else null end,
    nullif(trim(p_description), ''), v_new_balance, auth.uid()
  );
  return v_material;
end;
$$;

-- Şirket yöneticisi puantaj yetkisi aldıysa pazar otomasyonu çalışabilir.
create or replace function public.ensure_sunday_attendance_for_month(
  p_year integer,
  p_month integer
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_month_start date;
  v_month_end date;
  v_last_date date;
  v_inserted integer;
begin
  if auth.uid() is not null
    and not public.has_module_write_permission('attendance') then
    return 0;
  end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  if date_trunc('month', current_date)::date <> v_month_start then return 0; end if;
  v_last_date := least(v_month_end, current_date);
  insert into public.attendance_records (
    personnel_id, attendance_date, status, is_auto_generated
  )
  select
    p.id, d.attendance_date, 'weekly_rest'::public.attendance_status, true
  from public.personnel p
  cross join lateral (
    select generated_date::date as attendance_date
    from generate_series(
      v_month_start::timestamp, v_last_date::timestamp, interval '1 day'
    ) generated_date
    where extract(isodow from generated_date) = 7
  ) d
  where p.is_active = true
    and (p.created_at at time zone 'Europe/Istanbul')::date <= d.attendance_date
  on conflict (personnel_id, attendance_date) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
