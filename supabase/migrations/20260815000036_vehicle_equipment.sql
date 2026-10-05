-- Araç ekipmanlarını saha stoklarından ayırır ve araç zimmetini destekler.
alter table public.inventory_materials
  add column if not exists material_category text not null default 'stock';

alter table public.inventory_materials
  drop constraint if exists inventory_materials_material_category_check;
alter table public.inventory_materials
  add constraint inventory_materials_material_category_check
  check (material_category in ('stock', 'equipment'));

alter table public.inventory_custody_balances
  drop constraint if exists inventory_custody_balances_holder_type_check;
alter table public.inventory_custody_balances
  add constraint inventory_custody_balances_holder_type_check
  check (holder_type in ('personnel', 'team', 'vehicle'));

alter table public.inventory_custody_movements
  drop constraint if exists inventory_custody_movements_from_type_check;
alter table public.inventory_custody_movements
  add constraint inventory_custody_movements_from_type_check
  check (from_type in ('warehouse', 'personnel', 'team', 'vehicle'));
alter table public.inventory_custody_movements
  drop constraint if exists inventory_custody_movements_to_type_check;
alter table public.inventory_custody_movements
  add constraint inventory_custody_movements_to_type_check
  check (to_type in ('warehouse', 'personnel', 'team', 'vehicle'));

create or replace function public.transfer_inventory_custody(
  p_material_id uuid, p_quantity numeric,
  p_from_type text, p_from_id uuid,
  p_to_type text, p_to_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_source public.inventory_custody_balances;
  v_from_name text;
  v_to_name text;
  v_source_remaining numeric(14,3);
  v_destination_quantity numeric(14,3);
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_from_type not in ('warehouse','personnel','team','vehicle')
    or p_to_type not in ('warehouse','personnel','team','vehicle') then
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

  select * into v_material from public.inventory_materials
  where id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception 'Şantiye deposunda yetersiz miktar. Mevcut: %', v_material.stock_quantity;
    end if;
    v_from_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid() where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source from public.inventory_custody_balances
    where material_id = p_material_id and holder_type = p_from_type
      and holder_id = p_from_id for update;
    if not found or v_source.quantity < p_quantity then raise exception 'Kaynakta yetersiz malzeme'; end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where id = v_source.id;
    else
      update public.inventory_custody_balances set quantity = v_source_remaining,
        updated_by = auth.uid() where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid() where id = p_material_id returning stock_quantity into v_destination_quantity;
  else
    if p_to_type = 'vehicle' then
      select plate into v_to_name from public.vehicles where id = p_to_id;
    elsif p_to_type = 'personnel' then
      select full_name into v_to_name from public.personnel where id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name) into v_to_name
      from public.daily_work_plan_teams where id = p_to_id;
    end if;
    if v_to_name is null then raise exception 'Hedef bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (p_material_id, p_to_type, p_to_id, v_to_name, p_quantity, auth.uid())
    on conflict (material_id, holder_type, holder_id) do update set
      quantity = public.inventory_custody_balances.quantity + excluded.quantity,
      holder_name = excluded.holder_name, updated_by = auth.uid()
    returning quantity into v_destination_quantity;
  end if;

  insert into public.inventory_custody_movements
    (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
  values (p_material_id, p_from_type, p_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name, p_quantity, nullif(trim(p_notes),''), auth.uid());
  return jsonb_build_object('material_id',p_material_id,'source_remaining',v_source_remaining,
    'destination_quantity',v_destination_quantity);
end;
$$;

create or replace function public.create_custody_material(
  p_material_name text, p_material_code text, p_unit public.inventory_unit,
  p_initial_quantity numeric, p_vehicle_id uuid default null, p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v_id uuid; v_plate text;
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_material_name,''))) < 2 then raise exception 'Malzeme adı zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_unit = 'piece' and p_initial_quantity <> trunc(p_initial_quantity) then raise exception 'Adet tam sayı olmalıdır'; end if;
  insert into public.inventory_materials
    (material_code, material_name, unit, stock_quantity, notes, material_category, created_by, updated_by)
  values (nullif(trim(p_material_code),''), trim(p_material_name), p_unit,
    case when p_vehicle_id is null then p_initial_quantity else 0 end,
    nullif(trim(p_notes),''), 'equipment', auth.uid(), auth.uid()) returning id into v_id;
  insert into public.inventory_movements
    (material_id, movement_type, quantity, description, balance_after, created_by)
  values (v_id, 'in', p_initial_quantity, 'İlk araç ekipmanı girişi',
    case when p_vehicle_id is null then p_initial_quantity else 0 end, auth.uid());
  if p_vehicle_id is not null then
    select plate into v_plate from public.vehicles where id = p_vehicle_id;
    if v_plate is null then raise exception 'Araç bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (v_id, 'vehicle', p_vehicle_id, v_plate, p_initial_quantity, auth.uid());
    insert into public.inventory_custody_movements
      (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
    values (v_id, 'warehouse', null, 'Yeni Malzeme Girişi', 'vehicle', p_vehicle_id,
      v_plate, p_initial_quantity, 'İlk girişte araca zimmetlendi', auth.uid());
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_custody_material(text,text,public.inventory_unit,numeric,uuid,text) from public;
grant execute on function public.create_custody_material(text,text,public.inventory_unit,numeric,uuid,text) to authenticated;
