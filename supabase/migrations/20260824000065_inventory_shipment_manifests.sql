-- Biga sevkiyatlarını malzeme listesi ve teslim bilgileriyle tek belge olarak saklar.
create table if not exists public.inventory_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_date date not null,
  delivered_by text not null check (char_length(trim(delivered_by)) >= 2),
  received_by text not null check (char_length(trim(received_by)) >= 2),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_plate text not null check (char_length(trim(vehicle_plate)) >= 2),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.inventory_shipments(id) on delete cascade,
  material_id uuid not null references public.inventory_materials(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unique(shipment_id, material_id)
);

alter table public.inventory_movements
  add column if not exists shipment_id uuid references public.inventory_shipments(id) on delete cascade;

create index if not exists idx_inventory_shipments_date on public.inventory_shipments(shipment_date desc);
create index if not exists idx_inventory_shipment_items_shipment on public.inventory_shipment_items(shipment_id);

alter table public.inventory_shipments enable row level security;
alter table public.inventory_shipment_items enable row level security;
grant select on public.inventory_shipments, public.inventory_shipment_items to authenticated;
drop policy if exists "inventory_shipments_select_authenticated" on public.inventory_shipments;
create policy "inventory_shipments_select_authenticated" on public.inventory_shipments for select to authenticated using (true);
drop policy if exists "inventory_shipment_items_select_authenticated" on public.inventory_shipment_items;
create policy "inventory_shipment_items_select_authenticated" on public.inventory_shipment_items for select to authenticated using (true);

create or replace function public.create_biga_inventory_shipment(
  p_shipment_date date,
  p_delivered_by text,
  p_received_by text,
  p_vehicle_id uuid,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path=public set row_security=off
as $$
declare
  v_shipment_id uuid;
  v_vehicle_plate text;
  v_item jsonb;
  v_material public.inventory_materials;
  v_material_id uuid;
  v_quantity numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_delivered_by,''))) < 2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,''))) < 2 then raise exception 'Teslim alan zorunlu'; end if;
  select plate into v_vehicle_plate from public.vehicles where id=p_vehicle_id;
  if not found then raise exception 'Araç seçimi zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez'; end if;

  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),p_vehicle_id,v_vehicle_plate,nullif(trim(p_notes),''),auth.uid()) returning id into v_shipment_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 then raise exception 'Sevk miktarı sıfırdan büyük olmalıdır'; end if;
    select * into v_material from public.inventory_materials where id=v_material_id and material_category='stock' for update;
    if not found then raise exception 'Sevk edilecek malzeme bulunamadı'; end if;
    if v_material.unit='piece' and v_quantity<>trunc(v_quantity) then raise exception '% için adet miktarı tam sayı olmalıdır',v_material.material_name; end if;
    if v_material.stock_quantity<v_quantity then raise exception '% için Merkez Şantiye stoku yetersiz. Mevcut: %',v_material.material_name,v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity=stock_quantity-v_quantity,biga_stock_quantity=biga_stock_quantity+v_quantity,updated_by=auth.uid() where id=v_material_id returning * into v_material;
    insert into public.inventory_shipment_items(shipment_id,material_id,quantity) values(v_shipment_id,v_material_id,v_quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location,shipment_id)
    values(v_material_id,'out',v_quantity,'AZG BİGA ŞUBE',nullif(trim(p_notes),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga',v_shipment_id);
  end loop;
  return v_shipment_id;
end;
$$;

create or replace function public.delete_biga_inventory_shipment(p_shipment_id uuid)
returns void
language plpgsql security definer
set search_path=public set row_security=off
as $$
declare v_item record; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Sevkiyat silme yetkisi gerekli' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_shipments where id=p_shipment_id) then raise exception 'Sevkiyat bulunamadı'; end if;
  for v_item in select * from public.inventory_shipment_items where shipment_id=p_shipment_id loop
    select * into v_material from public.inventory_materials where id=v_item.material_id for update;
    if v_material.biga_stock_quantity<v_item.quantity then raise exception '% sevkiyatı silinemez; Biga stokunun bir kısmı kullanılmış',v_material.material_name; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,biga_stock_quantity=biga_stock_quantity-v_item.quantity,updated_by=auth.uid() where id=v_item.material_id;
  end loop;
  delete from public.inventory_shipments where id=p_shipment_id;
end;
$$;

revoke all on function public.create_biga_inventory_shipment(date,text,text,uuid,text,jsonb) from public;
revoke all on function public.delete_biga_inventory_shipment(uuid) from public;
grant execute on function public.create_biga_inventory_shipment(date,text,text,uuid,text,jsonb) to authenticated;
grant execute on function public.delete_biga_inventory_shipment(uuid) to authenticated;

create or replace function public.delete_inventory_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off
as $$
declare v_move public.inventory_movements; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok hareketi silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_move from public.inventory_movements where id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  if v_move.shipment_id is not null then raise exception 'Bu hareket sevkiyat kaydına bağlıdır; sevkiyat listesinden silinmelidir'; end if;
  select * into v_material from public.inventory_materials where id=v_move.material_id for update;
  if v_move.action_type='transfer' then
    if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu sevkiyat silinemez; Biga stokunun bir kısmı kullanılmış'; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
  elsif v_move.action_type='usage' then
    if coalesce(v_move.source_location,'center')='biga' then update public.inventory_materials set biga_stock_quantity=biga_stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id; end if;
  else
    if coalesce(v_move.target_location,'center')='biga' then
      if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış'; end if;
      update public.inventory_materials set biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else
      if v_material.stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış veya sevk edilmiş'; end if;
      update public.inventory_materials set stock_quantity=stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    end if;
  end if;
  delete from public.inventory_movements where id=p_movement_id;
end;
$$;
