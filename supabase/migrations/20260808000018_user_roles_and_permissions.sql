-- =============================================================================
-- 00018 — Kullanıcı onayı, roller ve veritabanı yetkileri
-- 00017'den sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  alter column role set default 'pending',
  add column if not exists is_approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid
    references auth.users (id) on delete set null;

-- İlk kurulum: belirlenen ana hesap şantiye şefi olur.
do $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid
  ) then
    raise exception 'Belirlenen şantiye şefi profili bulunamadı: %',
      '61bd2d56-8ea0-4e22-92d1-246742a8f6b4';
  end if;
end $$;

update public.profiles p
set
  role = case
    when p.id = '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid
      then 'site_chief'
    else 'pending'
  end,
  is_approved =
    p.id = '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid,
  approved_at = case
    when p.id = '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid
      then coalesce(p.approved_at, now())
    else null
  end,
  approved_by = case
    when p.id = '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid then p.id
    else null
  end;

alter table public.profiles
  add constraint profiles_role_check check (
    role in ('pending', 'site_chief', 'company_manager', 'accounting')
  );

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when p.is_approved then p.role
    else 'pending'
  end
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.is_site_chief()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() = 'site_chief', false);
$$;

create or replace function public.can_view_all()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    public.current_user_role() in ('site_chief', 'company_manager'),
    false
  );
$$;

create or replace function public.can_view_personnel_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    public.current_user_role()
      in ('site_chief', 'company_manager', 'accounting'),
    false
  );
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_site_chief() from public;
revoke all on function public.can_view_all() from public;
revoke all on function public.can_view_personnel_attendance() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_site_chief() to authenticated;
grant execute on function public.can_view_all() to authenticated;
grant execute on function public.can_view_personnel_attendance()
  to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('azg-first-site-chief'));

  select not exists (
    select 1
    from public.profiles
    where role = 'site_chief' and is_approved = true
  ) into v_is_first_user;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    is_approved,
    approved_at,
    approved_by
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case when v_is_first_user then 'site_chief' else 'pending' end,
    v_is_first_user,
    case when v_is_first_user then now() else null end,
    case when v_is_first_user then new.id else null end
  );
  return new;
end;
$$;

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
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Şantiye şefi kendi yetkisini değiştiremez';
  end if;
  if p_role not in ('company_manager', 'accounting', 'pending') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  if p_role = 'company_manager' then
    select count(*)::integer
    into v_manager_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and id <> p_user_id;

    if v_manager_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  update public.profiles
  set
    role = p_role,
    is_approved = p_role <> 'pending',
    approved_at = case when p_role <> 'pending' then now() else null end,
    approved_by = case when p_role <> 'pending' then auth.uid() else null end
  where id = p_user_id
    and role <> 'site_chief'
  returning * into v_profile;

  if not found then
    raise exception 'Kullanıcı bulunamadı veya rolü değiştirilemez';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.assign_user_role(uuid, text) from public;
grant execute on function public.assign_user_role(uuid, text)
  to authenticated;

-- Profiller: kullanıcı kendisini, şantiye şefi herkesi görebilir.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_role_based"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_site_chief());

-- Proje ve ayarlar: şef tam yetkili, şirket yöneticisi salt okunur.
drop policy if exists "projects_select_authenticated" on public.projects;
drop policy if exists "projects_insert_authenticated" on public.projects;
drop policy if exists "projects_update_authenticated" on public.projects;
drop policy if exists "projects_delete_authenticated" on public.projects;
create policy "projects_select_role_based"
  on public.projects for select to authenticated
  using (public.can_view_all());
create policy "projects_insert_site_chief"
  on public.projects for insert to authenticated
  with check (public.is_site_chief());
create policy "projects_update_site_chief"
  on public.projects for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "projects_delete_site_chief"
  on public.projects for delete to authenticated
  using (public.is_site_chief());

drop policy if exists "app_settings_select_authenticated"
  on public.app_settings;
drop policy if exists "app_settings_update_authenticated"
  on public.app_settings;
drop policy if exists "app_settings_insert_authenticated"
  on public.app_settings;
create policy "app_settings_select_role_based"
  on public.app_settings for select to authenticated
  using (public.can_view_all());
create policy "app_settings_insert_site_chief"
  on public.app_settings for insert to authenticated
  with check (public.is_site_chief());
create policy "app_settings_update_site_chief"
  on public.app_settings for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());

-- Personel ve puantaj: muhasebe dahil görüntüleme, yalnız şef değişiklik.
drop policy if exists "personnel_select_authenticated" on public.personnel;
drop policy if exists "personnel_insert_authenticated" on public.personnel;
drop policy if exists "personnel_update_authenticated" on public.personnel;
drop policy if exists "personnel_delete_authenticated" on public.personnel;
create policy "personnel_select_role_based"
  on public.personnel for select to authenticated
  using (public.can_view_personnel_attendance());
create policy "personnel_insert_site_chief"
  on public.personnel for insert to authenticated
  with check (public.is_site_chief());
create policy "personnel_update_site_chief"
  on public.personnel for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "personnel_delete_site_chief"
  on public.personnel for delete to authenticated
  using (public.is_site_chief());

drop policy if exists "attendance_select_authenticated"
  on public.attendance_records;
drop policy if exists "attendance_insert_authenticated"
  on public.attendance_records;
drop policy if exists "attendance_update_authenticated"
  on public.attendance_records;
drop policy if exists "attendance_delete_authenticated"
  on public.attendance_records;
create policy "attendance_select_role_based"
  on public.attendance_records for select to authenticated
  using (public.can_view_personnel_attendance());
create policy "attendance_insert_site_chief"
  on public.attendance_records for insert to authenticated
  with check (public.is_site_chief());
create policy "attendance_update_site_chief"
  on public.attendance_records for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "attendance_delete_site_chief"
  on public.attendance_records for delete to authenticated
  using (public.is_site_chief());

drop policy if exists "attendance_audit_select_authenticated"
  on public.attendance_audit_logs;
create policy "attendance_audit_select_role_based"
  on public.attendance_audit_logs for select to authenticated
  using (public.can_view_all());

-- İş planları: şef tam yetkili, şirket yöneticisi salt okunur.
drop policy if exists "dwp_select_authenticated" on public.daily_work_plans;
drop policy if exists "dwp_insert_authenticated" on public.daily_work_plans;
drop policy if exists "dwp_update_authenticated" on public.daily_work_plans;
drop policy if exists "dwp_delete_authenticated_temporary"
  on public.daily_work_plans;
create policy "dwp_select_role_based"
  on public.daily_work_plans for select to authenticated
  using (public.can_view_all());
create policy "dwp_insert_site_chief"
  on public.daily_work_plans for insert to authenticated
  with check (public.is_site_chief());
create policy "dwp_update_site_chief"
  on public.daily_work_plans for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "dwp_delete_site_chief"
  on public.daily_work_plans for delete to authenticated
  using (public.is_site_chief());

drop policy if exists "dwp_teams_select_authenticated"
  on public.daily_work_plan_teams;
drop policy if exists "dwp_teams_insert_authenticated"
  on public.daily_work_plan_teams;
drop policy if exists "dwp_teams_update_authenticated"
  on public.daily_work_plan_teams;
drop policy if exists "dwp_teams_delete_authenticated"
  on public.daily_work_plan_teams;
create policy "dwp_teams_select_role_based"
  on public.daily_work_plan_teams for select to authenticated
  using (public.can_view_all());
create policy "dwp_teams_insert_site_chief"
  on public.daily_work_plan_teams for insert to authenticated
  with check (public.is_site_chief());
create policy "dwp_teams_update_site_chief"
  on public.daily_work_plan_teams for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "dwp_teams_delete_site_chief"
  on public.daily_work_plan_teams for delete to authenticated
  using (public.is_site_chief());

drop policy if exists "dwp_members_select_authenticated"
  on public.daily_work_plan_team_members;
drop policy if exists "dwp_members_insert_authenticated"
  on public.daily_work_plan_team_members;
drop policy if exists "dwp_members_update_authenticated"
  on public.daily_work_plan_team_members;
drop policy if exists "dwp_members_delete_authenticated"
  on public.daily_work_plan_team_members;
create policy "dwp_members_select_role_based"
  on public.daily_work_plan_team_members for select to authenticated
  using (public.can_view_all());
create policy "dwp_members_insert_site_chief"
  on public.daily_work_plan_team_members for insert to authenticated
  with check (public.is_site_chief());
create policy "dwp_members_update_site_chief"
  on public.daily_work_plan_team_members for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
create policy "dwp_members_delete_site_chief"
  on public.daily_work_plan_team_members for delete to authenticated
  using (public.is_site_chief());

-- Araçlar ve stok: şef tam yetkili, şirket yöneticisi salt okunur.
drop policy if exists "vehicles_select_authenticated" on public.vehicles;
drop policy if exists "vehicles_insert_authenticated" on public.vehicles;
drop policy if exists "vehicles_update_authenticated" on public.vehicles;
create policy "vehicles_select_role_based"
  on public.vehicles for select to authenticated
  using (public.can_view_all());
create policy "vehicles_insert_site_chief"
  on public.vehicles for insert to authenticated
  with check (public.is_site_chief());
create policy "vehicles_update_site_chief"
  on public.vehicles for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());

drop policy if exists "inventory_materials_select_authenticated"
  on public.inventory_materials;
drop policy if exists "inventory_movements_select_authenticated"
  on public.inventory_movements;
create policy "inventory_materials_select_role_based"
  on public.inventory_materials for select to authenticated
  using (public.can_view_all());
create policy "inventory_movements_select_role_based"
  on public.inventory_movements for select to authenticated
  using (public.can_view_all());

-- SECURITY DEFINER stok fonksiyonlarının rol kontrolünü sıkılaştır.
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
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
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
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
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

-- Muhasebe/salt-okunur kullanıcı puantajı görüntülerken otomatik kayıt yazamaz.
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
  if auth.uid() is not null and not public.is_site_chief() then
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
