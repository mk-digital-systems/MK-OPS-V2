-- =============================================================================
-- 00024 — Malzeme zimmet ve depo/kişi/ekip transferleri
-- 00023'ten sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.company_manager_permissions
  add column if not exists custody_write boolean not null default false;

create table if not exists public.inventory_custody_balances (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null
    references public.inventory_materials (id) on delete restrict,
  holder_type text not null check (holder_type in ('personnel', 'team')),
  holder_id uuid not null,
  holder_name text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_custody_holder_unique
    unique (material_id, holder_type, holder_id)
);

create table if not exists public.inventory_custody_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null
    references public.inventory_materials (id) on delete restrict,
  from_type text not null
    check (from_type in ('warehouse', 'personnel', 'team')),
  from_id uuid,
  from_name text not null,
  to_type text not null
    check (to_type in ('warehouse', 'personnel', 'team')),
  to_id uuid,
  to_name text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_custody_different_locations check (
    from_type <> to_type or from_id is distinct from to_id
  ),
  constraint inventory_custody_from_reference check (
    (from_type = 'warehouse' and from_id is null)
    or (from_type <> 'warehouse' and from_id is not null)
  ),
  constraint inventory_custody_to_reference check (
    (to_type = 'warehouse' and to_id is null)
    or (to_type <> 'warehouse' and to_id is not null)
  )
);

create index if not exists idx_inventory_custody_balances_holder
  on public.inventory_custody_balances (holder_type, holder_id);
create index if not exists idx_inventory_custody_movements_created
  on public.inventory_custody_movements (created_at desc);
create index if not exists idx_inventory_custody_movements_material
  on public.inventory_custody_movements (material_id, created_at desc);

drop trigger if exists inventory_custody_balances_set_updated_at
  on public.inventory_custody_balances;
create trigger inventory_custody_balances_set_updated_at
before update on public.inventory_custody_balances
for each row execute function public.set_updated_at();

alter table public.inventory_custody_balances enable row level security;
alter table public.inventory_custody_movements enable row level security;
grant select on public.inventory_custody_balances,
  public.inventory_custody_movements to authenticated;

create policy "inventory_custody_balances_select_role_based"
  on public.inventory_custody_balances for select
  to authenticated using (public.can_view_all());
create policy "inventory_custody_movements_select_role_based"
  on public.inventory_custody_movements for select
  to authenticated using (public.can_view_all());

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
        when 'custody' then cmp.custody_write
        else false
      end
      from public.company_manager_permissions cmp
      where cmp.user_id = auth.uid()
    ), false)
  end;
$$;

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
    'projects', 'work_plans', 'personnel', 'attendance',
    'vehicles', 'inventory', 'custody'
  ) then
    raise exception 'Geçersiz yetki alanı';
  end if;
  if not exists (
    select 1 from public.profiles
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
    custody_write = case
      when p_module = 'custody' then p_enabled else custody_write end,
    updated_by = auth.uid()
  where user_id = p_user_id
  returning * into v_permissions;
  return v_permissions;
end;
$$;

create or replace function public.transfer_inventory_custody(
  p_material_id uuid,
  p_quantity numeric,
  p_from_type text,
  p_from_id uuid,
  p_to_type text,
  p_to_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_source public.inventory_custody_balances;
  v_from_name text;
  v_to_name text;
  v_source_remaining numeric(14, 3);
  v_destination_quantity numeric(14, 3);
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Zimmet işlem yetkisi gerekli'
      using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır';
  end if;
  if p_from_type not in ('warehouse', 'personnel', 'team')
    or p_to_type not in ('warehouse', 'personnel', 'team') then
    raise exception 'Geçersiz transfer konumu';
  end if;
  if (p_from_type = 'warehouse' and p_from_id is not null)
    or (p_from_type <> 'warehouse' and p_from_id is null)
    or (p_to_type = 'warehouse' and p_to_id is not null)
    or (p_to_type <> 'warehouse' and p_to_id is null) then
    raise exception 'Transfer konumu bilgisi geçersiz';
  end if;
  if p_from_type = p_to_type and p_from_id is not distinct from p_to_id then
    raise exception 'Kaynak ve hedef aynı olamaz';
  end if;

  select * into v_material
  from public.inventory_materials
  where id = p_material_id
  for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception 'Şantiye deposunda yetersiz stok. Mevcut: %',
        v_material.stock_quantity;
    end if;
    v_from_name := 'Şantiye Deposu';
    update public.inventory_materials
    set
      stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid()
    where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source
    from public.inventory_custody_balances
    where material_id = p_material_id
      and holder_type = p_from_type
      and holder_id = p_from_id
    for update;
    if not found or v_source.quantity < p_quantity then
      raise exception 'Kaynak zimmette yetersiz malzeme';
    end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where id = v_source.id;
    else
      update public.inventory_custody_balances
      set quantity = v_source_remaining, updated_by = auth.uid()
      where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := 'Şantiye Deposu';
    update public.inventory_materials
    set
      stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid()
    where id = p_material_id;
    select stock_quantity into v_destination_quantity
    from public.inventory_materials where id = p_material_id;
  else
    if p_to_type = 'personnel' then
      select full_name into v_to_name
      from public.personnel where id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name)
      into v_to_name
      from public.daily_work_plan_teams where id = p_to_id;
    end if;
    if v_to_name is null then
      raise exception 'Hedef kişi veya ekip bulunamadı';
    end if;

    insert into public.inventory_custody_balances (
      material_id, holder_type, holder_id, holder_name,
      quantity, updated_by
    )
    values (
      p_material_id, p_to_type, p_to_id, v_to_name,
      p_quantity, auth.uid()
    )
    on conflict (material_id, holder_type, holder_id)
    do update set
      quantity = public.inventory_custody_balances.quantity
        + excluded.quantity,
      holder_name = excluded.holder_name,
      updated_by = auth.uid()
    returning quantity into v_destination_quantity;
  end if;

  insert into public.inventory_custody_movements (
    material_id, from_type, from_id, from_name,
    to_type, to_id, to_name, quantity, notes, created_by
  )
  values (
    p_material_id, p_from_type, p_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name, p_quantity,
    nullif(trim(p_notes), ''), auth.uid()
  );

  return jsonb_build_object(
    'material_id', p_material_id,
    'source_remaining', v_source_remaining,
    'destination_quantity', v_destination_quantity
  );
end;
$$;

revoke all on function public.transfer_inventory_custody(
  uuid, numeric, text, uuid, text, uuid, text
) from public;
grant execute on function public.transfer_inventory_custody(
  uuid, numeric, text, uuid, text, uuid, text
) to authenticated;
