-- =============================================================================
-- MK OPS — malzeme stoku: firmaya özel kategoriler ve çoklu depo
--
-- Kopyalanan uygulamadan kalan telekom kategorileri (fiber_cable, copper_network,
-- fiber_accessory, underground) ve tek şube ("AZG BİGA ŞUBE", biga_stock_quantity)
-- kaldırılır.
--
-- * inventory_categories      firmanın kendi tanımladığı malzeme kategorileri
-- * inventory_locations       depolar / şubeler; her firmada bir ana depo (is_main)
-- * inventory_location_stocks ana depo dışındaki depoların stoğu
--
-- Ana deponun stoğu inventory_materials.stock_quantity'de kalır (araç ekipmanı
-- zimmeti ve irsaliye akışları bunu kullanır); diğer depolar inventory_location_stocks'ta.
-- Depolar arası sevkiyat inventory_shipments'ta (from_location_id → to_location_id).
-- =============================================================================

-- 1. Kategoriler --------------------------------------------------------------------------
create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index inventory_categories_name_unique on public.inventory_categories (company_id, lower(trim(name)));

comment on table public.inventory_categories is 'Firmanın malzeme stok kategorileri (ör. Elektrik, Sıhhi tesisat, Yedek parça)';

-- 2. Depolar ------------------------------------------------------------------------------
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  is_main boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index inventory_locations_name_unique on public.inventory_locations (company_id, lower(trim(name)));
create unique index inventory_locations_one_main on public.inventory_locations (company_id) where is_main;

comment on table public.inventory_locations is 'Depolar ve şubeler; is_main = ana depo (stoğu inventory_materials.stock_quantity)';

create table public.inventory_location_stocks (
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  material_id uuid not null,
  location_id uuid not null,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (material_id, location_id),
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete cascade,
  foreign key (company_id, location_id) references public.inventory_locations (company_id, id) on delete restrict
);
create index idx_inventory_location_stocks_location on public.inventory_location_stocks (location_id);

comment on table public.inventory_location_stocks is 'Ana depo dışındaki depoların malzeme stoğu';

-- Okuma: aynı firmadaki herkes; yazma yalnızca SECURITY DEFINER fonksiyonlarla.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['inventory_categories', 'inventory_locations', 'inventory_location_stocks'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format($p$create policy "company_isolation" on public.%I
      as restrictive for all to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()))$p$, v_table);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (true)', v_table, v_table);
  end loop;
end $$;

-- 3. Ana depo: her firmada bir tane ------------------------------------------------------------
create function public.inventory_main_location(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.inventory_locations where company_id = p_company_id and is_main;
  if v_id is null then
    insert into public.inventory_locations (company_id, name, is_main, sort_order)
    values (p_company_id, 'Merkez Depo', true, 0)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.inventory_locations where company_id = p_company_id and is_main;
    end if;
  end if;
  return v_id;
end;
$$;

create function public.companies_create_main_location()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.inventory_main_location(new.id);
  return null;
end;
$$;

create trigger companies_create_main_location
after insert on public.companies
for each row execute function public.companies_create_main_location();

select public.inventory_main_location(id) from public.companies;

-- 4. Veri taşıma (denetim kaydına "Sistem" satırları düşmesin) ---------------------------------
alter table public.inventory_catalog disable trigger zz_audit_row_change;
alter table public.inventory_materials disable trigger zz_audit_row_change;

-- 4a. Kategoriler: eski sabit değerler firmanın kategorisi olur
alter table public.inventory_catalog add column category_id uuid;
alter table public.inventory_materials add column category_id uuid;

insert into public.inventory_categories (company_id, name, sort_order)
select distinct x.company_id,
  case x.stock_category
    when 'fiber_cable' then 'Fiber Kablo'
    when 'copper_network' then 'Bakır Şebeke'
    when 'fiber_accessory' then 'Fiber Ek'
    when 'underground' then 'Yeraltı'
    else x.stock_category
  end,
  case x.stock_category
    when 'fiber_cable' then 1 when 'copper_network' then 2 when 'fiber_accessory' then 3 when 'underground' then 4 else 9
  end
from (
  select company_id, stock_category from public.inventory_catalog where stock_category is not null
  union
  select company_id, stock_category from public.inventory_materials where stock_category is not null
) x
on conflict do nothing;

update public.inventory_catalog c set category_id = k.id
from public.inventory_categories k
where k.company_id = c.company_id
  and lower(k.name) = lower(case c.stock_category
    when 'fiber_cable' then 'Fiber Kablo' when 'copper_network' then 'Bakır Şebeke'
    when 'fiber_accessory' then 'Fiber Ek' when 'underground' then 'Yeraltı' else c.stock_category end);

update public.inventory_materials m set category_id = k.id
from public.inventory_categories k
where k.company_id = m.company_id
  and lower(k.name) = lower(case m.stock_category
    when 'fiber_cable' then 'Fiber Kablo' when 'copper_network' then 'Bakır Şebeke'
    when 'fiber_accessory' then 'Fiber Ek' when 'underground' then 'Yeraltı' else m.stock_category end);

alter table public.inventory_catalog drop column stock_category;
alter table public.inventory_materials drop constraint if exists inventory_stock_category_check;
alter table public.inventory_materials drop column stock_category;

alter table public.inventory_catalog
  add constraint inventory_catalog_category_fkey
  foreign key (company_id, category_id) references public.inventory_categories (company_id, id)
  on delete set null (category_id);
alter table public.inventory_materials
  add constraint inventory_materials_category_fkey
  foreign key (company_id, category_id) references public.inventory_categories (company_id, id)
  on delete set null (category_id);
alter table public.inventory_materials
  add constraint inventory_materials_equipment_no_category
  check (material_category = 'stock' or category_id is null);
create index idx_inventory_catalog_category on public.inventory_catalog (category_id);

-- 4b. Depolar: eski "Biga" stoğu firmanın ikinci deposu olur
alter table public.inventory_movements add column source_location_id uuid;
alter table public.inventory_movements add column target_location_id uuid;
alter table public.inventory_shipments add column from_location_id uuid;
alter table public.inventory_shipments add column to_location_id uuid;

insert into public.inventory_locations (company_id, name, is_main, sort_order)
select c.id, 'Şube Deposu', false, 1
from public.companies c
where exists (select 1 from public.inventory_materials m where m.company_id = c.id and m.biga_stock_quantity > 0)
   or exists (select 1 from public.inventory_movements v where v.company_id = c.id and 'biga' in (v.source_location, v.target_location))
   or exists (select 1 from public.inventory_shipments s where s.company_id = c.id)
on conflict do nothing;

insert into public.inventory_location_stocks (company_id, material_id, location_id, quantity)
select m.company_id, m.id, l.id, m.biga_stock_quantity
from public.inventory_materials m
join public.inventory_locations l on l.company_id = m.company_id and l.name = 'Şube Deposu' and not l.is_main
where m.biga_stock_quantity > 0;

update public.inventory_movements v set
  source_location_id = case v.source_location
    when 'center' then (select id from public.inventory_locations where company_id = v.company_id and is_main)
    when 'biga' then (select id from public.inventory_locations where company_id = v.company_id and name = 'Şube Deposu' and not is_main)
  end,
  target_location_id = case v.target_location
    when 'center' then (select id from public.inventory_locations where company_id = v.company_id and is_main)
    when 'biga' then (select id from public.inventory_locations where company_id = v.company_id and name = 'Şube Deposu' and not is_main)
  end;

update public.inventory_shipments s set
  from_location_id = (select id from public.inventory_locations where company_id = s.company_id and is_main),
  to_location_id = (select id from public.inventory_locations where company_id = s.company_id and name = 'Şube Deposu' and not is_main);

alter table public.inventory_materials drop constraint if exists inventory_biga_stock_nonnegative;
alter table public.inventory_materials drop column biga_stock_quantity;
alter table public.inventory_movements drop column source_location;
alter table public.inventory_movements drop column target_location;

alter table public.inventory_movements
  add constraint inventory_movements_source_location_fkey
  foreign key (company_id, source_location_id) references public.inventory_locations (company_id, id)
  on delete restrict;
alter table public.inventory_movements
  add constraint inventory_movements_target_location_fkey
  foreign key (company_id, target_location_id) references public.inventory_locations (company_id, id)
  on delete restrict;

alter table public.inventory_shipments alter column from_location_id set not null;
alter table public.inventory_shipments alter column to_location_id set not null;
alter table public.inventory_shipments
  add constraint inventory_shipments_from_location_fkey
  foreign key (company_id, from_location_id) references public.inventory_locations (company_id, id)
  on delete restrict;
alter table public.inventory_shipments
  add constraint inventory_shipments_to_location_fkey
  foreign key (company_id, to_location_id) references public.inventory_locations (company_id, id)
  on delete restrict;
alter table public.inventory_shipments
  add constraint inventory_shipments_different_locations check (from_location_id <> to_location_id);

-- Sevkiyatta araç bilgisi opsiyonel
alter table public.inventory_shipments drop constraint if exists inventory_shipments_vehicle_plate_check;
alter table public.inventory_shipments alter column vehicle_plate drop not null;

comment on table public.inventory_shipments is 'Depolar arası sevkiyat (from_location_id → to_location_id)';

alter table public.inventory_catalog enable trigger zz_audit_row_change;
alter table public.inventory_materials enable trigger zz_audit_row_change;

-- 5. Stok yardımcıları (iç kullanım) ---------------------------------------------------------
create function public.inventory_location_name(p_location_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select name from public.inventory_locations where id = p_location_id;
$$;

/** Belirtilen depodaki stok miktarı. */
create function public.inventory_stock_at(p_material_id uuid, p_location_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when l.is_main then (select m.stock_quantity from public.inventory_materials m where m.id = p_material_id)
    else coalesce((select s.quantity from public.inventory_location_stocks s
                   where s.material_id = p_material_id and s.location_id = p_location_id), 0)
  end
  from public.inventory_locations l where l.id = p_location_id;
$$;

/** Depodaki stoğu p_delta kadar değiştirir; yeni miktarı döndürür. Yetersizse hata verir. */
create function public.inventory_adjust_stock(p_material_id uuid, p_location_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_location public.inventory_locations;
  v_material public.inventory_materials;
  v_current numeric;
  v_new numeric;
begin
  select * into v_location from public.inventory_locations
  where id = p_location_id and company_id = public.current_company_id();
  if not found then raise exception 'Depo bulunamadı'; end if;
  select * into v_material from public.inventory_materials
  where id = p_material_id and company_id = public.current_company_id() for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;

  if v_location.is_main then
    v_current := v_material.stock_quantity;
  else
    select quantity into v_current from public.inventory_location_stocks
    where material_id = p_material_id and location_id = p_location_id for update;
    v_current := coalesce(v_current, 0);
  end if;

  v_new := v_current + p_delta;
  if v_new < 0 then
    raise exception '%: % stoku yetersiz. Mevcut: %', v_location.name, v_material.material_name, trim_scale(v_current);
  end if;

  if v_location.is_main then
    update public.inventory_materials set stock_quantity = v_new, updated_by = auth.uid() where id = p_material_id;
  elsif v_new = 0 then
    delete from public.inventory_location_stocks where material_id = p_material_id and location_id = p_location_id;
  else
    insert into public.inventory_location_stocks (company_id, material_id, location_id, quantity)
    values (v_material.company_id, p_material_id, p_location_id, v_new)
    on conflict (material_id, location_id) do update set quantity = excluded.quantity, updated_at = now();
  end if;
  return v_new;
end;
$$;

/** Firma deposunu doğrular; null ise ana depoyu döndürür. */
create function public.inventory_resolve_location(p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_location_id is null then
    return public.inventory_main_location(public.current_company_id());
  end if;
  if not exists (select 1 from public.inventory_locations where id = p_location_id and company_id = public.current_company_id()) then
    raise exception 'Depo bulunamadı';
  end if;
  return p_location_id;
end;
$$;

-- 6. Kategori ve depo yönetimi -----------------------------------------------------------------
create function public.save_inventory_category(p_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then raise exception 'Kategori adı zorunlu'; end if;
  if exists (select 1 from public.inventory_categories where company_id = public.current_company_id()
             and lower(trim(name)) = lower(v_name) and id is distinct from p_id) then
    raise exception 'Bu adla bir kategori zaten var';
  end if;
  if p_id is null then
    insert into public.inventory_categories (company_id, name, sort_order)
    values (public.current_company_id(), v_name,
      coalesce((select max(sort_order) + 1 from public.inventory_categories where company_id = public.current_company_id()), 1))
    returning id into v_id;
  else
    update public.inventory_categories set name = v_name
    where id = p_id and company_id = public.current_company_id() returning id into v_id;
    if v_id is null then raise exception 'Kategori bulunamadı'; end if;
  end if;
  return v_id;
end;
$$;

create function public.delete_inventory_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  -- Bu kategorideki malzemeler "Kategorisiz" olur (yabancı anahtar: set null).
  delete from public.inventory_categories where id = p_id and company_id = public.current_company_id();
  if not found then raise exception 'Kategori bulunamadı'; end if;
end;
$$;

create function public.save_inventory_location(p_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Depo adı en az 2 karakter olmalı'; end if;
  perform public.inventory_main_location(public.current_company_id());
  if exists (select 1 from public.inventory_locations where company_id = public.current_company_id()
             and lower(trim(name)) = lower(v_name) and id is distinct from p_id) then
    raise exception 'Bu adla bir depo zaten var';
  end if;
  if p_id is null then
    insert into public.inventory_locations (company_id, name, is_main, sort_order)
    values (public.current_company_id(), v_name, false,
      coalesce((select max(sort_order) + 1 from public.inventory_locations where company_id = public.current_company_id()), 1))
    returning id into v_id;
  else
    update public.inventory_locations set name = v_name
    where id = p_id and company_id = public.current_company_id() returning id into v_id;
    if v_id is null then raise exception 'Depo bulunamadı'; end if;
  end if;
  return v_id;
end;
$$;

create function public.delete_inventory_location(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_location public.inventory_locations;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  select * into v_location from public.inventory_locations where id = p_id and company_id = public.current_company_id();
  if not found then raise exception 'Depo bulunamadı'; end if;
  if v_location.is_main then raise exception 'Ana depo silinemez; adını değiştirebilirsiniz'; end if;
  if exists (select 1 from public.inventory_location_stocks where location_id = p_id and quantity > 0) then
    raise exception '%: depoda stok var. Önce stoğu başka depoya sevk edin.', v_location.name;
  end if;
  if exists (select 1 from public.inventory_movements where p_id in (source_location_id, target_location_id))
    or exists (select 1 from public.inventory_shipments where p_id in (from_location_id, to_location_id)) then
    raise exception '%: deponun hareket geçmişi var; silinemez', v_location.name;
  end if;
  delete from public.inventory_location_stocks where location_id = p_id;
  delete from public.inventory_locations where id = p_id;
end;
$$;

-- 7. Katalog ve talep (kategori kimliğiyle) --------------------------------------------------------
drop function public.create_inventory_catalog_material(text, text, text, text, public.inventory_unit, boolean, text);
drop function public.create_inventory_material(text, text, public.inventory_unit, numeric, text, date, text, text, text);

create function public.inventory_check_category(p_category_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories where id = p_category_id and company_id = public.current_company_id()
  ) then
    raise exception 'Kategori bulunamadı';
  end if;
  return p_category_id;
end;
$$;

create function public.create_inventory_catalog_material(
  p_material_name text, p_category_id uuid, p_material_type text, p_size text,
  p_unit public.inventory_unit, p_has_id boolean, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_material_name, ''))) < 2 then raise exception 'Malzeme adı zorunlu'; end if;
  insert into public.inventory_catalog (material_name, category_id, material_type, size, unit, has_id, notes, created_by)
  values (trim(p_material_name), public.inventory_check_category(p_category_id), nullif(trim(p_material_type), ''),
    nullif(trim(p_size), ''), p_unit, coalesce(p_has_id, false), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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
      select unit into v_unit from public.inventory_catalog where company_id=public.current_company_id() and id=v_catalog_id;
      if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    else
      v_new := v_item->'new_catalog';
      if v_new is null or char_length(trim(coalesce(v_new->>'material_name',''))) < 2 then raise exception 'Yeni malzeme adı zorunlu'; end if;
      v_unit := (v_new->>'unit')::public.inventory_unit;
      insert into public.inventory_catalog(material_name,category_id,material_type,size,unit,has_id,notes,created_by)
      values(trim(v_new->>'material_name'),public.inventory_check_category(nullif(v_new->>'category_id','')::uuid),
        nullif(trim(v_new->>'material_type'),''),nullif(trim(v_new->>'size'),''),v_unit,
        coalesce((v_new->>'has_id')::boolean,false),nullif(trim(v_new->>'notes'),''),auth.uid())
      returning id into v_catalog_id;
    end if;
    if v_unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    insert into public.inventory_request_items(request_id,catalog_id,quantity) values(v_request_id,v_catalog_id,v_qty);
  end loop;
  return v_request_id;
end $$;

-- 8. Stok girişi (irsaliye) — seçilen depoya ----------------------------------------------------
drop function public.create_inventory_receipt(date, text, text, text, jsonb);

create function public.create_inventory_receipt(
  p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb,
  p_location_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid; v_item jsonb; v_catalog public.inventory_catalog; v_material public.inventory_materials;
  v_qty numeric; v_code text; v_location uuid; v_balance numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then
    raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  v_location := public.inventory_resolve_location(p_location_id);
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=(v_item->>'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty:=(v_item->>'quantity')::numeric; v_code:=nullif(trim(v_item->>'material_code'),'');
    if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code:=null; end if;
    if v_code is not null and exists(select 1 from public.inventory_materials where company_id=public.current_company_id() and lower(trim(material_code))=lower(v_code)) then
      raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code;
    end if;
    select * into v_material from public.inventory_materials
    where company_id=public.current_company_id() and catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,category_id,material_type,size,unit,stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.category_id,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,v_catalog.notes,auth.uid(),auth.uid())
      returning * into v_material;
    end if;
    v_balance := public.inventory_adjust_stock(v_material.id, v_location, v_qty);
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_material.id,v_qty);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location_id,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_qty,'İrsaliye ile stok girişi',v_balance,auth.uid(),'in',v_location,p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
  end loop;
  return v_id;
end $$;

create or replace function public.approve_inventory_request_receipt(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request public.inventory_requests; v_item record; v_catalog public.inventory_catalog; v_receipt_id uuid;
  v_material public.inventory_materials; v_code text; v_location uuid; v_balance numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul onay yetkisi gerekli' using errcode='42501'; end if;
  select * into v_request from public.inventory_requests where company_id=public.current_company_id() and id=p_request_id for update;
  if not found or v_request.status<>'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  v_location := public.inventory_main_location(public.current_company_id());
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_request.pending_receipt_notes,auth.uid()) returning id into v_receipt_id;
  for v_item in select * from public.inventory_request_receipt_items where company_id=public.current_company_id() and request_id=p_request_id loop
    select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=v_item.catalog_id;
    v_code:=v_item.material_code;
    select * into v_material from public.inventory_materials
    where company_id=public.current_company_id() and catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,category_id,material_type,size,unit,stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.category_id,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,v_catalog.notes,auth.uid(),auth.uid())
      returning * into v_material;
    end if;
    v_balance := public.inventory_adjust_stock(v_material.id, v_location, v_item.quantity);
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_receipt_id,v_material.id,v_item.quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location_id,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_item.quantity,'Malzeme talebinden irsaliye ile stok girişi',v_balance,auth.uid(),'in',v_location,
      v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_receipt_id);
  end loop;
  update public.inventory_requests set status='received',received_at=now(),receipt_id=v_receipt_id where id=p_request_id;
  return v_receipt_id;
end $$;

-- 9. Stoktan düşme / ekleme — seçilen depodan ---------------------------------------------------
drop function public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text, text, text, uuid[], text);

create function public.record_inventory_movement(
  p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric,
  p_location_id uuid default null, p_project_name text default null, p_project_code text default null,
  p_team_personnel_ids uuid[] default '{}'::uuid[], p_description text default null)
returns public.inventory_materials
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_location uuid;
  v_balance numeric(14,3);
  v_names text[];
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_movement_type = 'out' and char_length(trim(coalesce(p_project_name, ''))) < 2 then
    raise exception 'Proje adı zorunlu';
  end if;
  select * into v_material from public.inventory_materials where company_id = public.current_company_id() and id = p_material_id;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;

  v_location := public.inventory_resolve_location(p_location_id);
  v_balance := public.inventory_adjust_stock(p_material_id, v_location,
    case when p_movement_type = 'in' then p_quantity else -p_quantity end);

  select coalesce(array_agg(full_name order by full_name), '{}') into v_names
  from public.personnel where company_id = public.current_company_id() and id = any(coalesce(p_team_personnel_ids, '{}'));

  insert into public.inventory_movements
    (material_id, movement_type, quantity, usage_location, description, balance_after, created_by,
     action_type, source_location_id, target_location_id, project_name, project_code, team_personnel_ids, team_personnel_names)
  values
    (p_material_id, p_movement_type, p_quantity,
     case when p_movement_type = 'out' then trim(p_project_name) end,
     nullif(trim(p_description), ''), v_balance, auth.uid(),
     case when p_movement_type = 'in' then 'in' else 'usage' end,
     case when p_movement_type = 'out' then v_location end,
     case when p_movement_type = 'in' then v_location end,
     case when p_movement_type = 'out' then trim(p_project_name) end,
     case when p_movement_type = 'out' then nullif(trim(p_project_code), '') end,
     coalesce(p_team_personnel_ids, '{}'), v_names);

  select * into v_material from public.inventory_materials where id = p_material_id;
  return v_material;
end;
$$;

-- 10. Depolar arası sevkiyat ---------------------------------------------------------------------
drop function public.create_biga_inventory_shipment(date, text, text, text, text, jsonb);
drop function public.delete_biga_inventory_shipment(uuid);
drop function public.transfer_inventory_to_biga(uuid, numeric, text);

create function public.create_inventory_transfer(
  p_shipment_date date, p_from_location_id uuid, p_to_location_id uuid,
  p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_shipment_id uuid; v_item jsonb; v_material public.inventory_materials; v_material_id uuid; v_quantity numeric;
  v_from uuid; v_to uuid; v_balance numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if p_from_location_id is null or p_to_location_id is null then raise exception 'Çıkış ve varış deposu zorunlu'; end if;
  v_from := public.inventory_resolve_location(p_from_location_id);
  v_to := public.inventory_resolve_location(p_to_location_id);
  if v_from = v_to then raise exception 'Çıkış ve varış deposu aynı olamaz'; end if;
  if char_length(trim(coalesce(p_delivered_by,'')))<2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then
    raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez';
  end if;

  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by,from_location_id,to_location_id)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),null,nullif(upper(trim(coalesce(p_vehicle_plate,''))),''),
    nullif(trim(p_notes),''),auth.uid(),v_from,v_to)
  returning id into v_shipment_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 then raise exception 'Sevk miktarı sıfırdan büyük olmalıdır'; end if;
    select * into v_material from public.inventory_materials
    where company_id=public.current_company_id() and id=v_material_id and material_category='stock';
    if not found then raise exception 'Sevk edilecek malzeme bulunamadı'; end if;
    if v_material.unit='piece' and v_quantity<>trunc(v_quantity) then raise exception '% için adet miktarı tam sayı olmalıdır',v_material.material_name; end if;
    v_balance := public.inventory_adjust_stock(v_material_id, v_from, -v_quantity);
    perform public.inventory_adjust_stock(v_material_id, v_to, v_quantity);
    insert into public.inventory_shipment_items(shipment_id,material_id,quantity) values(v_shipment_id,v_material_id,v_quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location_id,target_location_id,shipment_id)
    values(v_material_id,'out',v_quantity,public.inventory_location_name(v_to),nullif(trim(p_notes),''),v_balance,auth.uid(),'transfer',v_from,v_to,v_shipment_id);
  end loop;
  return v_shipment_id;
end;
$$;

create function public.delete_inventory_transfer(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_shipment public.inventory_shipments; v_item record;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Sevkiyat silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_shipment from public.inventory_shipments where company_id=public.current_company_id() and id=p_shipment_id for update;
  if not found then raise exception 'Sevkiyat bulunamadı'; end if;
  for v_item in select * from public.inventory_shipment_items where company_id=public.current_company_id() and shipment_id=p_shipment_id loop
    -- Varış deposundaki stok kullanılmışsa geri alınamaz (adjust yetersizlik hatası verir).
    perform public.inventory_adjust_stock(v_item.material_id, v_shipment.to_location_id, -v_item.quantity);
    perform public.inventory_adjust_stock(v_item.material_id, v_shipment.from_location_id, v_item.quantity);
  end loop;
  delete from public.inventory_shipments where id=p_shipment_id;
end;
$$;

create or replace function public.delete_inventory_movement(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_move public.inventory_movements;
  v_main uuid := public.inventory_main_location(public.current_company_id());
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok hareketi silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_move from public.inventory_movements where company_id=public.current_company_id() and id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  if v_move.shipment_id is not null then raise exception 'Bu hareket sevkiyat kaydına bağlıdır; sevkiyat listesinden silinmelidir'; end if;
  if v_move.action_type='transfer' then
    perform public.inventory_adjust_stock(v_move.material_id, coalesce(v_move.target_location_id, v_main), -v_move.quantity);
    perform public.inventory_adjust_stock(v_move.material_id, coalesce(v_move.source_location_id, v_main), v_move.quantity);
  elsif v_move.action_type='usage' then
    perform public.inventory_adjust_stock(v_move.material_id, coalesce(v_move.source_location_id, v_main), v_move.quantity);
  else
    perform public.inventory_adjust_stock(v_move.material_id, coalesce(v_move.target_location_id, v_main), -v_move.quantity);
  end if;
  delete from public.inventory_movements where id=p_movement_id;
end;
$$;

-- 11. Araç ekipmanı: "Şantiye Deposu" yerine ana deponun adı ---------------------------------------
create or replace function public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text default null)
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
  v_source_remaining numeric(14,3);
  v_destination_quantity numeric(14,3);
  v_warehouse_name text := coalesce(public.inventory_location_name(public.inventory_main_location(public.current_company_id())), 'Depo');
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
  where company_id=public.current_company_id() and id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception '%: yetersiz miktar. Mevcut: %', v_warehouse_name, trim_scale(v_material.stock_quantity);
    end if;
    v_from_name := v_warehouse_name;
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid() where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source from public.inventory_custody_balances
    where company_id=public.current_company_id() and material_id = p_material_id and holder_type = p_from_type
      and holder_id = p_from_id for update;
    if not found or v_source.quantity < p_quantity then raise exception 'Kaynakta yetersiz malzeme'; end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where company_id=public.current_company_id() and id = v_source.id;
    else
      update public.inventory_custody_balances set quantity = v_source_remaining,
        updated_by = auth.uid() where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := v_warehouse_name;
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid() where id = p_material_id returning stock_quantity into v_destination_quantity;
  else
    if p_to_type = 'vehicle' then
      select plate into v_to_name from public.vehicles where company_id=public.current_company_id() and id = p_to_id;
    elsif p_to_type = 'personnel' then
      select full_name into v_to_name from public.personnel where company_id=public.current_company_id() and id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name) into v_to_name
      from public.daily_work_plan_teams where company_id=public.current_company_id() and id = p_to_id;
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

-- 12. Denetim kaydı: kategori ve depolar da yazılsın ------------------------------------------------
-- Etiketler eklendi; kaldırılan biga sütunu yok sayılanlar listesinden çıkarıldı.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_company_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  -- Kayda yazılmayan teknik / türetilmiş alanlar
  v_ignored text[] := array[
    'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'progress_percent', 'has_activity', 'status_sort_order', 'priority_order',
    'waiting_at', 'in_progress_at', 'on_hold_at', 'delayed_at', 'archived_at',
    'cancelled_at', 'cancelled_by', 'done_quantity', 'percent', 'started_at',
    'stock_quantity', 'avatar_path', 'approved_at', 'approved_by',
    'priced_at', 'owner_user_id'
  ];
  -- Değeri gösterilmeyen hassas alanlar
  v_masked text[] := array['tc_identity_number'];
begin
  if pg_trigger_depth() > 1 or current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return null;
  end if;

  v_company_id := case
    when tg_table_name = 'companies' then (v_row ->> 'id')::uuid
    else coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid)
  end;
  if v_company_id is null or not exists (select 1 from public.companies c where c.id = v_company_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignored);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key,
          case when v_key = any (v_masked)
            then jsonb_build_object('old', '***', 'new', '***')
            else jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
          end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb and coalesce(tg_argv[1], '') <> 'always' then
      return null;
    end if;
  else
    for v_key in select jsonb_object_keys(v_row) loop
      continue when v_key = any (v_ignored) or jsonb_typeof(v_row -> v_key) = 'null';
      v_changes := v_changes || jsonb_build_object(v_key,
        case when v_key = any (v_masked) then to_jsonb('***'::text) else v_row -> v_key end);
    end loop;
  end if;

  v_label := case tg_table_name
    when 'projects' then concat_ws(' · ', v_row ->> 'name', v_row ->> 'project_code')
    when 'project_types' then v_row ->> 'name'
    when 'project_sections' then (
      select concat_ws(' · ', p.name, v_row ->> 'name') from public.projects p where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_progress' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.projects p
      left join public.project_sections ps on ps.id = (v_row ->> 'section_id')::uuid
      left join public.project_type_stages st on st.id = (v_row ->> 'stage_id')::uuid
      where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_logs' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'hakedis_stage_prices' then (
      select concat_ws(' · ', t.name, st.name)
      from public.project_type_stages st join public.project_types t on t.id = st.project_type_id
      where st.id = (v_row ->> 'stage_id')::uuid)
    when 'hakedis_project_prices' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'personnel' then v_row ->> 'full_name'
    when 'personnel_advances' then (
      select p.full_name from public.personnel p where p.id = (v_row ->> 'personnel_id')::uuid)
    when 'vehicles' then v_row ->> 'plate'
    when 'inventory_catalog' then v_row ->> 'material_name'
    when 'inventory_materials' then concat_ws(' · ', v_row ->> 'material_name', v_row ->> 'material_code')
    when 'inventory_categories' then v_row ->> 'name'
    when 'inventory_locations' then v_row ->> 'name'
    when 'daily_work_plans' then 'İş planı ' || to_char((v_row ->> 'plan_date')::date, 'DD.MM.YYYY')
    when 'production_entries' then concat_ws(' · ',
      to_char((v_row ->> 'work_date')::date, 'DD.MM.YYYY'), v_row ->> 'team_leader_name_snapshot')
    when 'profiles' then coalesce(nullif(v_row ->> 'full_name', ''), v_row ->> 'email')
    when 'company_manager_permissions' then (
      select coalesce(nullif(pr.full_name, ''), pr.email) from public.profiles pr where pr.id = (v_row ->> 'user_id')::uuid)
    when 'companies' then v_row ->> 'name'
    else null
  end;

  -- Üst kayıt (proje / personel / aşama) silinirken zincirleme silinen alt satırlar yazılmaz;
  -- üst kaydın silinmesi zaten kayıtta.
  if tg_op = 'DELETE' and v_label is null and tg_table_name in (
    'project_sections', 'project_stage_progress', 'project_stage_logs',
    'hakedis_stage_prices', 'hakedis_project_prices', 'personnel_advances',
    'company_manager_permissions'
  ) then
    return null;
  end if;

  if v_actor is not null then
    select coalesce(nullif(p.full_name, ''), p.email), p.role
    into v_actor_name, v_actor_role
    from public.profiles p where p.id = v_actor;
    if public.is_super_admin() then
      v_actor_role := 'super_admin';
      v_actor_name := coalesce(v_actor_name, 'MK OPS Destek');
    end if;
  end if;

  insert into public.audit_logs
    (company_id, actor_user_id, actor_name, actor_role, module, entity_type, entity_id, entity_label, action, changes)
  values (
    v_company_id,
    v_actor,
    coalesce(v_actor_name, case when v_actor is null then 'Sistem' end),
    v_actor_role,
    tg_argv[0],
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    left(v_label, 300),
    lower(tg_op),
    v_changes
  );
  return null;
end;
$$;

create trigger zz_audit_row_change after insert or update or delete on public.inventory_categories
  for each row execute function public.audit_row_change('inventory');
create trigger zz_audit_row_change after insert or update or delete on public.inventory_locations
  for each row execute function public.audit_row_change('inventory');

-- 13. Yetkiler -----------------------------------------------------------------------------------
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'inventory_main_location', 'companies_create_main_location', 'inventory_location_name', 'inventory_stock_at',
        'inventory_adjust_stock', 'inventory_resolve_location', 'inventory_check_category',
        'save_inventory_category', 'delete_inventory_category', 'save_inventory_location', 'delete_inventory_location',
        'create_inventory_catalog_material', 'create_inventory_request', 'create_inventory_receipt',
        'approve_inventory_request_receipt', 'record_inventory_movement', 'create_inventory_transfer',
        'delete_inventory_transfer', 'delete_inventory_movement', 'transfer_inventory_custody'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
  end loop;
end $$;

grant execute on function public.save_inventory_category(uuid, text) to authenticated;
grant execute on function public.delete_inventory_category(uuid) to authenticated;
grant execute on function public.save_inventory_location(uuid, text) to authenticated;
grant execute on function public.delete_inventory_location(uuid) to authenticated;
grant execute on function public.create_inventory_catalog_material(text, uuid, text, text, public.inventory_unit, boolean, text) to authenticated;
grant execute on function public.create_inventory_request(date, text, text, jsonb) to authenticated;
grant execute on function public.create_inventory_receipt(date, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.approve_inventory_request_receipt(uuid) to authenticated;
grant execute on function public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, uuid, text, text, uuid[], text) to authenticated;
grant execute on function public.create_inventory_transfer(date, uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.delete_inventory_transfer(uuid) to authenticated;
grant execute on function public.delete_inventory_movement(uuid) to authenticated;
grant execute on function public.transfer_inventory_custody(uuid, numeric, text, uuid, text, uuid, text) to authenticated;
