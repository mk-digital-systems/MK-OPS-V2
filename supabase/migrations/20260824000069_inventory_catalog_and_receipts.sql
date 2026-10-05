-- Malzeme kataloğunu stok kabul irsaliyelerinden ayırır.
alter table public.inventory_materials add column if not exists material_type text, add column if not exists size text;

create table if not exists public.inventory_receipts (
  id uuid primary key default gen_random_uuid(), receipt_date date not null,
  received_by text not null check(char_length(trim(received_by))>=2),
  dispatch_number text not null check(char_length(trim(dispatch_number))>=1),
  notes text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_inventory_receipts_dispatch on public.inventory_receipts(lower(trim(dispatch_number)));
create table if not exists public.inventory_receipt_items (
  id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.inventory_receipts(id) on delete cascade,
  material_id uuid not null references public.inventory_materials(id) on delete cascade,
  quantity numeric(14,3) not null check(quantity>0), unique(receipt_id,material_id)
);
alter table public.inventory_movements add column if not exists receipt_id uuid references public.inventory_receipts(id) on delete cascade;
alter table public.inventory_receipts enable row level security; alter table public.inventory_receipt_items enable row level security;
grant select on public.inventory_receipts,public.inventory_receipt_items to authenticated;
drop policy if exists "inventory_receipts_select" on public.inventory_receipts;
create policy "inventory_receipts_select" on public.inventory_receipts for select to authenticated using(true);
drop policy if exists "inventory_receipt_items_select" on public.inventory_receipt_items;
create policy "inventory_receipt_items_select" on public.inventory_receipt_items for select to authenticated using(true);

create or replace function public.create_inventory_catalog_material(p_material_name text,p_material_code text,p_stock_category text,p_material_type text,p_size text,p_unit public.inventory_unit,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_id uuid;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_material_name,'')))<2 then raise exception 'Malzeme adı zorunlu'; end if;
 if p_stock_category not in('fiber_cable','copper_network','fiber_accessory') then raise exception 'Kategori zorunlu'; end if;
 insert into public.inventory_materials(material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
 values(nullif(trim(p_material_code),''),trim(p_material_name),p_stock_category,nullif(trim(p_material_type),''),nullif(trim(p_size),''),p_unit,0,0,nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning id into v_id;
 return v_id;
end $$;

create or replace function public.create_inventory_receipt(p_receipt_date date,p_received_by text,p_dispatch_number text,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_id uuid; v_item jsonb; v_material public.inventory_materials; v_mid uuid; v_qty numeric;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if p_receipt_date is null then raise exception 'Teslim tarihi zorunlu'; end if;
 if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
 if char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'İrsaliye numarası zorunlu'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then raise exception 'Aynı malzeme iki kez eklenemez'; end if;
 insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by) values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_mid:=(v_item->>'material_id')::uuid; v_qty:=(v_item->>'quantity')::numeric;
  if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  select * into v_material from public.inventory_materials where id=v_mid and material_category='stock' for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit='piece' and v_qty<>trunc(v_qty) then raise exception '% için adet tam sayı olmalıdır',v_material.material_name; end if;
  update public.inventory_materials set stock_quantity=stock_quantity+v_qty,updated_by=auth.uid() where id=v_mid returning * into v_material;
  insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_mid,v_qty);
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
  values(v_mid,'in',v_qty,'İrsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
 end loop; return v_id;
end $$;

create or replace function public.delete_inventory_material_with_history(p_material_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_materials where id=p_material_id and material_category='stock') then raise exception 'Malzeme bulunamadı'; end if;
 delete from public.inventory_movements where material_id=p_material_id;
 delete from public.inventory_shipment_items where material_id=p_material_id;
 delete from public.inventory_receipt_items where material_id=p_material_id;
 delete from public.inventory_shipments s where not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_materials where id=p_material_id;
end $$;

revoke all on function public.create_inventory_catalog_material(text,text,text,text,text,public.inventory_unit,text) from public;
revoke all on function public.create_inventory_receipt(date,text,text,text,jsonb) from public;
revoke all on function public.delete_inventory_material_with_history(uuid) from public;
grant execute on function public.create_inventory_catalog_material(text,text,text,text,text,public.inventory_unit,text) to authenticated;
grant execute on function public.create_inventory_receipt(date,text,text,text,jsonb) to authenticated;
grant execute on function public.delete_inventory_material_with_history(uuid) to authenticated;
