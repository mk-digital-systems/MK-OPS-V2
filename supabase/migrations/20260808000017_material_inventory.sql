-- =============================================================================
-- 00017 — Malzeme stok yönetimi
-- 00016'dan sonra çalıştırılmalıdır.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_unit') then
    create type public.inventory_unit as enum ('piece', 'meter', 'kilogram');
  end if;
  if not exists (
    select 1 from pg_type where typname = 'inventory_movement_type'
  ) then
    create type public.inventory_movement_type as enum ('in', 'out');
  end if;
end $$;

create table if not exists public.inventory_materials (
  id uuid primary key default gen_random_uuid(),
  material_code text,
  material_name text not null,
  unit public.inventory_unit not null,
  stock_quantity numeric(14, 3) not null default 0,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_material_name_length
    check (char_length(trim(material_name)) >= 2),
  constraint inventory_material_stock_nonnegative check (stock_quantity >= 0),
  constraint inventory_piece_stock_integer
    check (unit <> 'piece' or stock_quantity = trunc(stock_quantity))
);

create unique index if not exists idx_inventory_material_code_unique
  on public.inventory_materials (lower(trim(material_code)))
  where material_code is not null and trim(material_code) <> '';
create index if not exists idx_inventory_material_name
  on public.inventory_materials (material_name);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null
    references public.inventory_materials (id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity numeric(14, 3) not null,
  usage_location text,
  description text,
  balance_after numeric(14, 3) not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movement_quantity_positive check (quantity > 0),
  constraint inventory_out_usage_location_required check (
    movement_type <> 'out'
    or char_length(trim(coalesce(usage_location, ''))) >= 2
  )
);

create index if not exists idx_inventory_movements_material_created
  on public.inventory_movements (material_id, created_at desc);

drop trigger if exists inventory_materials_set_updated_at
  on public.inventory_materials;
create trigger inventory_materials_set_updated_at
before update on public.inventory_materials
for each row execute function public.set_updated_at();

alter table public.inventory_materials enable row level security;
alter table public.inventory_movements enable row level security;

grant select on public.inventory_materials, public.inventory_movements
  to authenticated;

drop policy if exists "inventory_materials_select_authenticated"
  on public.inventory_materials;
create policy "inventory_materials_select_authenticated"
  on public.inventory_materials for select
  to authenticated using (true);

drop policy if exists "inventory_movements_select_authenticated"
  on public.inventory_movements;
create policy "inventory_movements_select_authenticated"
  on public.inventory_movements for select
  to authenticated using (true);

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
as $$
declare
  v_material public.inventory_materials;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
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
    material_code,
    material_name,
    unit,
    stock_quantity,
    notes,
    created_by,
    updated_by
  )
  values (
    nullif(trim(p_material_code), ''),
    trim(p_material_name),
    p_unit,
    p_initial_quantity,
    nullif(trim(p_notes), ''),
    auth.uid(),
    auth.uid()
  )
  returning * into v_material;

  insert into public.inventory_movements (
    material_id,
    movement_type,
    quantity,
    description,
    balance_after,
    created_by
  )
  values (
    v_material.id,
    'in',
    p_initial_quantity,
    'İlk stok girişi',
    p_initial_quantity,
    auth.uid()
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
as $$
declare
  v_material public.inventory_materials;
  v_new_balance numeric(14, 3);
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır';
  end if;

  select *
  into v_material
  from public.inventory_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'Malzeme bulunamadı';
  end if;
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
  set
    stock_quantity = v_new_balance,
    updated_by = auth.uid()
  where id = p_material_id
  returning * into v_material;

  insert into public.inventory_movements (
    material_id,
    movement_type,
    quantity,
    usage_location,
    description,
    balance_after,
    created_by
  )
  values (
    p_material_id,
    p_movement_type,
    p_quantity,
    case
      when p_movement_type = 'out' then trim(p_usage_location)
      else null
    end,
    nullif(trim(p_description), ''),
    v_new_balance,
    auth.uid()
  );

  return v_material;
end;
$$;

revoke all on function public.create_inventory_material(
  text, text, public.inventory_unit, numeric, text
) from public;
revoke all on function public.record_inventory_movement(
  uuid, public.inventory_movement_type, numeric, text, text
) from public;
grant execute on function public.create_inventory_material(
  text, text, public.inventory_unit, numeric, text
) to authenticated;
grant execute on function public.record_inventory_movement(
  uuid, public.inventory_movement_type, numeric, text, text
) to authenticated;

comment on table public.inventory_materials is
  'Güncel malzeme stok bakiyeleri';
comment on table public.inventory_movements is
  'Silinmeyen malzeme giriş ve kullanım hareketleri';
