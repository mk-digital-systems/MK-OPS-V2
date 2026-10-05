-- Malzeme taleplerini katalogdan stok kabulüne kadar izler.
create table if not exists public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null,
  requested_by text not null check (char_length(trim(requested_by)) >= 2),
  status text not null default 'requested' check (status in ('requested','approved','receipt_review','received')),
  notes text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  receipt_id uuid references public.inventory_receipts(id) on delete set null,
  pending_receipt_date date,
  pending_received_by text,
  pending_dispatch_number text,
  pending_receipt_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_request_receipt_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  catalog_id uuid not null references public.inventory_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  material_code text,
  unique(request_id,catalog_id,material_code)
);

create table if not exists public.inventory_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  catalog_id uuid not null references public.inventory_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unique (request_id, catalog_id)
);

alter table public.inventory_requests enable row level security;
alter table public.inventory_request_items enable row level security;
alter table public.inventory_request_receipt_items enable row level security;
grant select on public.inventory_requests, public.inventory_request_items, public.inventory_request_receipt_items to authenticated;
drop policy if exists "inventory_requests_select" on public.inventory_requests;
create policy "inventory_requests_select" on public.inventory_requests for select to authenticated using (true);
drop policy if exists "inventory_request_items_select" on public.inventory_request_items;
create policy "inventory_request_items_select" on public.inventory_request_items for select to authenticated using (true);
drop policy if exists "inventory_request_receipt_items_select" on public.inventory_request_receipt_items;
create policy "inventory_request_receipt_items_select" on public.inventory_request_receipt_items for select to authenticated using (true);

create or replace function public.create_inventory_request(
  p_request_date date, p_requested_by text, p_notes text, p_items jsonb
) returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_request_id uuid; v_item jsonb; v_new jsonb; v_catalog_id uuid; v_qty numeric; v_unit public.inventory_unit;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep yetkisi gerekli' using errcode='42501'; end if;
  if p_request_date is null or char_length(trim(coalesce(p_requested_by,''))) < 2 then raise exception 'Talep tarihi ve talep eden zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir talep kalemi eklenmelidir'; end if;
  insert into public.inventory_requests(request_date,requested_by,notes,created_by)
  values(p_request_date,trim(p_requested_by),nullif(trim(p_notes),''),auth.uid()) returning id into v_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if nullif(v_item->>'catalog_id','') is not null then
      v_catalog_id := (v_item->>'catalog_id')::uuid;
      select unit into v_unit from public.inventory_catalog where id=v_catalog_id;
      if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    else
      v_new := v_item->'new_catalog';
      if v_new is null or char_length(trim(coalesce(v_new->>'material_name',''))) < 2 then raise exception 'Yeni malzeme adı zorunlu'; end if;
      if v_new->>'stock_category' not in ('fiber_cable','copper_network','fiber_accessory') then raise exception 'Yeni malzeme kategorisi zorunlu'; end if;
      v_unit := (v_new->>'unit')::public.inventory_unit;
      insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
      values(trim(v_new->>'material_name'),v_new->>'stock_category',nullif(trim(v_new->>'material_type'),''),nullif(trim(v_new->>'size'),''),v_unit,coalesce((v_new->>'has_id')::boolean,false),nullif(trim(v_new->>'notes'),''),auth.uid())
      returning id into v_catalog_id;
    end if;
    if v_unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    insert into public.inventory_request_items(request_id,catalog_id,quantity) values(v_request_id,v_catalog_id,v_qty);
  end loop;
  return v_request_id;
end $$;

create or replace function public.approve_inventory_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep onay yetkisi gerekli' using errcode='42501'; end if;
  update public.inventory_requests set status='approved',approved_at=now(),approved_by=auth.uid() where id=p_request_id and status='requested';
  if not found then raise exception 'Yalnızca talep edilmiş kayıt onaylanabilir'; end if;
end $$;

create or replace function public.submit_inventory_request_receipt(
  p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text,
  p_notes text default null, p_items jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare v_request public.inventory_requests; v_item jsonb; v_catalog public.inventory_catalog; v_qty numeric; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul yetkisi gerekli' using errcode='42501'; end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
  select * into v_request from public.inventory_requests where id=p_request_id for update;
  if not found or v_request.status<>'approved' then raise exception 'Yalnızca onaylanmış talep stoğa alınabilir'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'İrsaliyede en az bir malzeme olmalıdır'; end if;
  delete from public.inventory_request_receipt_items where request_id=p_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where id=(v_item->>'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    v_code := nullif(trim(v_item->>'material_code'),'');
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code:=null; end if;
    if v_code is not null and exists(select 1 from public.inventory_materials where lower(trim(material_code))=lower(v_code)) then raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code; end if;
    insert into public.inventory_request_receipt_items(request_id,catalog_id,quantity,material_code) values(p_request_id,v_catalog.id,v_qty,v_code);
  end loop;
  update public.inventory_requests set status='receipt_review',pending_receipt_date=p_receipt_date,pending_received_by=trim(p_received_by),pending_dispatch_number=trim(p_dispatch_number),pending_receipt_notes=nullif(trim(p_notes),'') where id=p_request_id;
end $$;

create or replace function public.approve_inventory_request_receipt(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare v_request public.inventory_requests; v_item record; v_catalog public.inventory_catalog; v_receipt_id uuid; v_material public.inventory_materials; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul onay yetkisi gerekli' using errcode='42501'; end if;
  select * into v_request from public.inventory_requests where id=p_request_id for update;
  if not found or v_request.status<>'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_request.pending_receipt_notes,auth.uid()) returning id into v_receipt_id;
  for v_item in select * from public.inventory_request_receipt_items where request_id=p_request_id loop
    select * into v_catalog from public.inventory_catalog where id=v_item.catalog_id;
    v_code:=v_item.material_code;
    select * into v_material from public.inventory_materials where catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
    end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,updated_by=auth.uid() where id=v_material.id returning * into v_material;
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_receipt_id,v_material.id,v_item.quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_item.quantity,'Malzeme talebinden irsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_receipt_id);
  end loop;
  update public.inventory_requests set status='received',received_at=now(),receipt_id=v_receipt_id where id=p_request_id;
  return v_receipt_id;
end $$;

revoke all on function public.create_inventory_request(date,text,text,jsonb) from public;
revoke all on function public.approve_inventory_request(uuid) from public;
revoke all on function public.submit_inventory_request_receipt(uuid,date,text,text,text,jsonb) from public;
revoke all on function public.approve_inventory_request_receipt(uuid) from public;
grant execute on function public.create_inventory_request(date,text,text,jsonb) to authenticated;
grant execute on function public.approve_inventory_request(uuid) to authenticated;
grant execute on function public.submit_inventory_request_receipt(uuid,date,text,text,text,jsonb) to authenticated;
grant execute on function public.approve_inventory_request_receipt(uuid) to authenticated;
