-- Biga sevkiyat aracı şirket araçlarından bağımsız, manuel girilir.
drop function if exists public.create_biga_inventory_shipment(date,text,text,uuid,text,jsonb);

create or replace function public.create_biga_inventory_shipment(
  p_shipment_date date, p_delivered_by text, p_received_by text,
  p_vehicle_plate text, p_notes text, p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path=public set row_security=off
as $$
declare v_shipment_id uuid; v_item jsonb; v_material public.inventory_materials; v_material_id uuid; v_quantity numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_delivered_by,'')))<2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if char_length(trim(coalesce(p_vehicle_plate,'')))<2 then raise exception 'Araç bilgisi zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez'; end if;
  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),null,upper(trim(p_vehicle_plate)),nullif(trim(p_notes),''),auth.uid()) returning id into v_shipment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
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

revoke all on function public.create_biga_inventory_shipment(date,text,text,text,text,jsonb) from public;
grant execute on function public.create_biga_inventory_shipment(date,text,text,text,text,jsonb) to authenticated;
