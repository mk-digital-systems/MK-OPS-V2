-- Katalog tanımını, irsaliye sırasında oluşan ID/birim bazlı stoklardan ayırır.
create table if not exists public.inventory_catalog (
  id uuid primary key default gen_random_uuid(), material_name text not null,
  stock_category text not null check(stock_category in('fiber_cable','copper_network','fiber_accessory')),
  material_type text, size text, unit public.inventory_unit not null, has_id boolean not null default false, notes text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create unique index if not exists idx_inventory_catalog_identity on public.inventory_catalog(lower(trim(material_name)),stock_category,lower(trim(coalesce(material_type,''))),lower(trim(coalesce(size,''))));
alter table public.inventory_catalog enable row level security; grant select on public.inventory_catalog to authenticated;
drop policy if exists "inventory_catalog_select" on public.inventory_catalog;
create policy "inventory_catalog_select" on public.inventory_catalog for select to authenticated using(true);

alter table public.inventory_materials add column if not exists catalog_id uuid references public.inventory_catalog(id) on delete cascade;
insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
select distinct on (lower(trim(m.material_name)),m.stock_category,lower(trim(coalesce(m.material_type,''))),lower(trim(coalesce(m.size,''))),m.unit)
  m.material_name,m.stock_category,m.material_type,m.size,m.unit,(m.material_code is not null),m.notes,m.created_by
from public.inventory_materials m where m.material_category='stock' and m.catalog_id is null
on conflict do nothing;
update public.inventory_materials m set catalog_id=c.id from public.inventory_catalog c
where m.catalog_id is null and m.material_category='stock' and lower(trim(c.material_name))=lower(trim(m.material_name)) and c.stock_category=m.stock_category
 and lower(trim(coalesce(c.material_type,'')))=lower(trim(coalesce(m.material_type,''))) and lower(trim(coalesce(c.size,'')))=lower(trim(coalesce(m.size,''))) and c.unit=m.unit;
create index if not exists idx_inventory_materials_catalog on public.inventory_materials(catalog_id);

drop function if exists public.create_inventory_catalog_material(text,text,text,text,text,public.inventory_unit,text);
create or replace function public.create_inventory_catalog_material(p_material_name text,p_stock_category text,p_material_type text,p_size text,p_unit public.inventory_unit,p_has_id boolean,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_id uuid; begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_material_name,'')))<2 then raise exception 'Malzeme adı zorunlu'; end if;
 if p_stock_category not in('fiber_cable','copper_network','fiber_accessory') then raise exception 'Kategori zorunlu'; end if;
 insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
 values(trim(p_material_name),p_stock_category,nullif(trim(p_material_type),''),nullif(trim(p_size),''),p_unit,coalesce(p_has_id,false),nullif(trim(p_notes),''),auth.uid()) returning id into v_id; return v_id;
end $$;

drop function if exists public.create_inventory_receipt(date,text,text,text,jsonb);
create or replace function public.create_inventory_receipt(p_receipt_date date,p_received_by text,p_dispatch_number text,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_id uuid; v_item jsonb; v_catalog public.inventory_catalog; v_material public.inventory_materials; v_mid uuid; v_qty numeric; v_code text;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
 insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by) values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_catalog from public.inventory_catalog where id=(v_item->>'catalog_id')::uuid;
  if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
  v_qty:=(v_item->>'quantity')::numeric; v_code:=nullif(trim(v_item->>'material_code'),'');
  if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
  if not v_catalog.has_id then v_code:=null; end if;
  if v_code is not null and exists(select 1 from public.inventory_materials where lower(trim(material_code))=lower(v_code)) then
   raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code;
  end if;
  select * into v_material from public.inventory_materials where catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
  if not found then
   insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
   values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
  end if;
  update public.inventory_materials set stock_quantity=stock_quantity+v_qty,updated_by=auth.uid() where id=v_material.id returning * into v_material;
  insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_material.id,v_qty);
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
  values(v_material.id,'in',v_qty,'İrsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
 end loop; return v_id;
end $$;

revoke all on function public.create_inventory_catalog_material(text,text,text,text,public.inventory_unit,boolean,text) from public;
revoke all on function public.create_inventory_receipt(date,text,text,text,jsonb) from public;
grant execute on function public.create_inventory_catalog_material(text,text,text,text,public.inventory_unit,boolean,text) to authenticated;
grant execute on function public.create_inventory_receipt(date,text,text,text,jsonb) to authenticated;

create or replace function public.delete_inventory_catalog_with_history(p_catalog_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare v_material record;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_catalog where id=p_catalog_id) then raise exception 'Katalog malzemesi bulunamadı'; end if;
 for v_material in select id from public.inventory_materials where catalog_id=p_catalog_id loop
  delete from public.inventory_movements where material_id=v_material.id;
  delete from public.inventory_shipment_items where material_id=v_material.id;
  delete from public.inventory_receipt_items where material_id=v_material.id;
 end loop;
 delete from public.inventory_shipments s where not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_catalog where id=p_catalog_id;
end $$;
revoke all on function public.delete_inventory_catalog_with_history(uuid) from public;
grant execute on function public.delete_inventory_catalog_with_history(uuid) to authenticated;
