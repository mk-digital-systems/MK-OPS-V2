-- Merkez/Biga stok ayrımı, manuel proje/ekip bilgisi ve geri alınabilir hareket silme.
alter table public.inventory_materials
  add column if not exists biga_stock_quantity numeric(14, 3) not null default 0;

alter table public.inventory_materials
  drop constraint if exists inventory_biga_stock_nonnegative;
alter table public.inventory_materials
  add constraint inventory_biga_stock_nonnegative check (biga_stock_quantity >= 0);

alter table public.inventory_movements
  add column if not exists action_type text not null default 'usage',
  add column if not exists source_location text,
  add column if not exists target_location text,
  add column if not exists project_name text,
  add column if not exists project_code text,
  add column if not exists team_personnel_ids uuid[] not null default '{}',
  add column if not exists team_personnel_names text[] not null default '{}';

update public.inventory_movements
set action_type = case when movement_type = 'in' then 'in' else 'usage' end,
    source_location = case when movement_type = 'out' then 'center' else null end,
    target_location = case when movement_type = 'in' then 'center' else null end,
    project_name = case when movement_type = 'out' then usage_location else null end
where source_location is null and target_location is null;

alter table public.inventory_movements
  drop constraint if exists inventory_movement_action_check;
alter table public.inventory_movements
  add constraint inventory_movement_action_check
    check (action_type in ('in', 'usage', 'transfer'));
alter table public.inventory_movements
  drop constraint if exists inventory_movement_source_check;
alter table public.inventory_movements
  add constraint inventory_movement_source_check
    check (source_location is null or source_location in ('center', 'biga'));
alter table public.inventory_movements
  drop constraint if exists inventory_movement_target_check;
alter table public.inventory_movements
  add constraint inventory_movement_target_check
    check (target_location is null or target_location in ('center', 'biga'));
alter table public.inventory_movements
  drop constraint if exists inventory_out_usage_location_required;

drop function if exists public.record_inventory_movement(
  uuid, public.inventory_movement_type, numeric, text, text
);

create or replace function public.create_inventory_material(
  p_material_name text,
  p_material_code text,
  p_unit public.inventory_unit,
  p_initial_quantity numeric,
  p_notes text default null
)
returns public.inventory_materials
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_material_name,''))) < 2 then raise exception 'Malzeme cinsi zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity <= 0 then raise exception 'Başlangıç miktarı sıfırdan büyük olmalıdır'; end if;
  if p_unit='piece' and p_initial_quantity<>trunc(p_initial_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  insert into public.inventory_materials(material_code,material_name,unit,stock_quantity,notes,created_by,updated_by)
  values(nullif(trim(p_material_code),''),trim(p_material_name),p_unit,p_initial_quantity,nullif(trim(p_notes),''),auth.uid(),auth.uid())
  returning * into v_material;
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location)
  values(v_material.id,'in',p_initial_quantity,'İlk stok girişi',p_initial_quantity,auth.uid(),'in','center');
  return v_material;
end;
$$;

create or replace function public.record_inventory_movement(
  p_material_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_source_location text default 'center',
  p_project_name text default null,
  p_project_code text default null,
  p_team_personnel_ids uuid[] default '{}',
  p_description text default null
)
returns public.inventory_materials
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_balance numeric(14,3);
  v_names text[];
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_source_location not in ('center', 'biga') then raise exception 'Geçersiz stok konumu'; end if;
  if p_movement_type = 'out' and char_length(trim(coalesce(p_project_name, ''))) < 2 then
    raise exception 'Proje adı zorunlu';
  end if;

  select * into v_material from public.inventory_materials where id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;

  if p_movement_type = 'in' then
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  elsif p_source_location = 'center' then
    if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  else
    if v_material.biga_stock_quantity < p_quantity then raise exception 'AZG BİGA ŞUBE stoku yetersiz. Mevcut: %', v_material.biga_stock_quantity; end if;
    update public.inventory_materials set biga_stock_quantity = biga_stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.biga_stock_quantity;
  end if;

  select coalesce(array_agg(full_name order by full_name), '{}') into v_names
  from public.personnel where id = any(coalesce(p_team_personnel_ids, '{}'));

  insert into public.inventory_movements
    (material_id, movement_type, quantity, usage_location, description, balance_after, created_by,
     action_type, source_location, target_location, project_name, project_code, team_personnel_ids, team_personnel_names)
  values
    (p_material_id, p_movement_type, p_quantity,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     nullif(trim(p_description), ''), v_balance, auth.uid(),
     case when p_movement_type = 'in' then 'in' else 'usage' end,
     case when p_movement_type = 'out' then p_source_location else null end,
     case when p_movement_type = 'in' then 'center' else null end,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     case when p_movement_type = 'out' then nullif(trim(p_project_code), '') else null end,
     coalesce(p_team_personnel_ids, '{}'), v_names);
  return v_material;
end;
$$;

create or replace function public.transfer_inventory_to_biga(
  p_material_id uuid, p_quantity numeric, p_description text default null
)
returns public.inventory_materials
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  select * into v_material from public.inventory_materials where id=p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit='piece' and p_quantity<>trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
  update public.inventory_materials
  set stock_quantity=stock_quantity-p_quantity, biga_stock_quantity=biga_stock_quantity+p_quantity, updated_by=auth.uid()
  where id=p_material_id returning * into v_material;
  insert into public.inventory_movements
    (material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location)
  values (p_material_id,'out',p_quantity,'AZG BİGA ŞUBE',nullif(trim(p_description),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga');
  return v_material;
end;
$$;

create or replace function public.delete_inventory_movement(p_movement_id uuid)
returns void
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v_move public.inventory_movements; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok hareketi silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_move from public.inventory_movements where id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  select * into v_material from public.inventory_materials where id=v_move.material_id for update;

  if v_move.action_type='transfer' then
    if v_material.biga_stock_quantity < v_move.quantity then raise exception 'Bu sevkiyat silinemez; Biga stokunun bir kısmı kullanılmış'; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity, biga_stock_quantity=biga_stock_quantity-v_move.quantity, updated_by=auth.uid() where id=v_move.material_id;
  elsif v_move.action_type='usage' then
    if coalesce(v_move.source_location,'center')='biga' then
      update public.inventory_materials set biga_stock_quantity=biga_stock_quantity+v_move.quantity, updated_by=auth.uid() where id=v_move.material_id;
    else
      update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity, updated_by=auth.uid() where id=v_move.material_id;
    end if;
  else
    if v_move.target_location='biga' then
      if v_material.biga_stock_quantity < v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış'; end if;
      update public.inventory_materials set biga_stock_quantity=biga_stock_quantity-v_move.quantity, updated_by=auth.uid() where id=v_move.material_id;
    else
      if v_material.stock_quantity < v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış veya sevk edilmiş'; end if;
      update public.inventory_materials set stock_quantity=stock_quantity-v_move.quantity, updated_by=auth.uid() where id=v_move.material_id;
    end if;
  end if;
  delete from public.inventory_movements where id=p_movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(uuid,public.inventory_movement_type,numeric,text,text,text,uuid[],text) from public;
revoke all on function public.transfer_inventory_to_biga(uuid,numeric,text) from public;
revoke all on function public.delete_inventory_movement(uuid) from public;
grant execute on function public.record_inventory_movement(uuid,public.inventory_movement_type,numeric,text,text,text,uuid[],text) to authenticated;
grant execute on function public.transfer_inventory_to_biga(uuid,numeric,text) to authenticated;
grant execute on function public.delete_inventory_movement(uuid) to authenticated;
