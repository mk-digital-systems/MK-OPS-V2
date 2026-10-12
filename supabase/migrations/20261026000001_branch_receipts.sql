-- Şube irsaliyesi onayı ve şubeye bağlı malzeme talepleri
--
--   1. İrsaliye ile stok girişi depoya ve şubeye bağlanır. Firma yöneticisi veya Merkez şantiye şefi girerse
--      stok hemen artar; şube şantiye şefi veya muhasebe girerse irsaliye "Onay bekliyor" olarak kaydedilir,
--      stok değişmez. Firma yöneticisi / Merkez şefi onaylayınca seçilen depoya (şubenin deposu) işlenir,
--      reddederse silinir. İrsaliye geçmişi şubeye göre görünür.
--   2. Malzeme talebi şubeye bağlıdır (şube kullanıcısı kendi şubesine açar). Talebi ve stok girişini
--      firma yöneticisi veya Merkez şefi onaylar; malzeme irsaliye kontrolünde seçilen şube deposuna girer.
--   3. Onay bekleyen irsaliye ve talepler firma yöneticisi / Merkez şefine bildirilir.

-- 1. İrsaliye: depo, şube, onay durumu -------------------------------------------------------

alter table public.inventory_receipts
  add column location_id uuid,
  add column branch_id uuid,
  add column status text not null default 'approved' check (status in ('pending', 'approved')),
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;

alter table public.inventory_receipts disable trigger user;
update public.inventory_receipts r set location_id = coalesce(
  (select m.target_location_id from public.inventory_movements m
   where m.receipt_id = r.id and m.target_location_id is not null limit 1),
  public.inventory_main_location(r.company_id));
update public.inventory_receipts r set branch_id = (select l.branch_id from public.inventory_locations l where l.id = r.location_id);
alter table public.inventory_receipts enable trigger user;

alter table public.inventory_receipts
  alter column location_id set not null,
  alter column branch_id set not null,
  add constraint inventory_receipts_location_fkey foreign key (company_id, location_id)
    references public.inventory_locations (company_id, id),
  add constraint inventory_receipts_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id);
create index idx_inventory_receipts_branch on public.inventory_receipts (branch_id);
create index idx_inventory_receipts_pending on public.inventory_receipts (company_id) where status = 'pending';

comment on column public.inventory_receipts.status is
  'pending: şube şefi/muhasebe girdi, firma yöneticisi/Merkez şefi onayı bekliyor (stok değişmedi); approved: stoğa işlendi';

create policy branch_isolation on public.inventory_receipts as restrictive for all to authenticated
  using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

-- Onay bekleyen irsaliyenin satırları (onayda stoğa işlenir, sonra silinir).
create table public.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  receipt_id uuid not null,
  catalog_id uuid not null,
  material_code text,
  quantity numeric(14,3) not null check (quantity > 0),
  constraint inventory_receipt_lines_receipt_fkey foreign key (company_id, receipt_id)
    references public.inventory_receipts (company_id, id) on delete cascade,
  constraint inventory_receipt_lines_catalog_fkey foreign key (company_id, catalog_id)
    references public.inventory_catalog (company_id, id) on delete cascade
);
create index idx_inventory_receipt_lines_receipt on public.inventory_receipt_lines (receipt_id);

comment on table public.inventory_receipt_lines is 'Onay bekleyen irsaliyenin malzemeleri';

alter table public.inventory_receipt_lines enable row level security;
revoke all on public.inventory_receipt_lines from anon;
grant select on public.inventory_receipt_lines to authenticated;
create policy company_isolation on public.inventory_receipt_lines as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy inventory_receipt_lines_select on public.inventory_receipt_lines for select to authenticated
  using (exists (select 1 from public.inventory_receipts r where r.id = receipt_id));
create trigger a0_enforce_company_scope before insert or update or delete on public.inventory_receipt_lines
  for each row execute function public.enforce_company_scope();

-- 2. Malzeme talebi: şube ve giriş deposu ---------------------------------------------------------

alter table public.inventory_requests add column branch_id uuid, add column location_id uuid;
alter table public.inventory_requests disable trigger user;
update public.inventory_requests r set branch_id = public.company_main_branch(r.company_id);
alter table public.inventory_requests enable trigger user;
alter table public.inventory_requests
  alter column branch_id set not null,
  add constraint inventory_requests_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  add constraint inventory_requests_location_fkey foreign key (company_id, location_id)
    references public.inventory_locations (company_id, id);
create index idx_inventory_requests_branch on public.inventory_requests (branch_id);

comment on column public.inventory_requests.location_id is 'Malzemenin gireceği depo (irsaliye kontrolünde seçilir)';

create trigger a0_set_default_branch before insert on public.inventory_requests
  for each row execute function public.set_default_branch();
create trigger a1_guard_branch_write before insert or update or delete on public.inventory_requests
  for each row execute function public.guard_branch_write('self');
create policy branch_isolation on public.inventory_requests as restrictive for all to authenticated
  using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));
create policy branch_isolation on public.inventory_request_items as restrictive for all to authenticated
  using (exists (select 1 from public.inventory_requests r where r.id = request_id));
create policy branch_isolation on public.inventory_request_receipt_items as restrictive for all to authenticated
  using (exists (select 1 from public.inventory_requests r where r.id = request_id));

-- 3. Ortak yardımcılar ----------------------------------------------------------------------------

-- Şubenin varsayılan deposu: Merkez için ana depo, diğer şubeler için ilk depo.
create function public.inventory_branch_location(p_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select l.id from public.inventory_locations l
  where l.branch_id = p_branch_id and l.company_id = public.current_company_id()
  order by l.is_main desc, l.sort_order, l.name
  limit 1;
$$;

-- İrsaliye satırlarını doğrular (katalog, miktar, ID). Başka bekleyen irsaliyedeki ID de kullanılmış sayılır.
create function public.inventory_check_receipt_items(p_items jsonb, p_receipt_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_item jsonb; v_catalog public.inventory_catalog; v_qty numeric; v_code text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir malzeme eklenmelidir';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog
    where company_id = public.current_company_id() and id = (v_item ->> 'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_code := nullif(trim(v_item ->> 'material_code'), '');
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit = 'piece' and v_qty <> trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu', v_catalog.material_name; end if;
    if v_catalog.has_id and (
      exists (select 1 from public.inventory_materials
              where company_id = public.current_company_id() and lower(trim(material_code)) = lower(v_code))
      or exists (select 1 from public.inventory_receipt_lines
                 where company_id = public.current_company_id() and lower(trim(material_code)) = lower(v_code)
                   and receipt_id is distinct from p_receipt_id)) then
      raise exception 'Bu malzeme ID daha önce kullanılmış: %', v_code;
    end if;
  end loop;
end;
$$;

-- İrsaliyeyi deposuna işler: malzeme (ID) kaydı, stok, irsaliye kalemi ve hareket.
create function public.inventory_post_receipt(p_receipt_id uuid, p_items jsonb, p_description text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_receipt public.inventory_receipts; v_item jsonb; v_catalog public.inventory_catalog;
  v_material public.inventory_materials; v_qty numeric; v_code text; v_balance numeric;
begin
  select * into v_receipt from public.inventory_receipts
  where id = p_receipt_id and company_id = public.current_company_id();
  if not found then raise exception 'İrsaliye bulunamadı'; end if;
  perform public.inventory_check_receipt_items(p_items, p_receipt_id);
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog
    where company_id = public.current_company_id() and id = (v_item ->> 'catalog_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_code := case when v_catalog.has_id then nullif(trim(v_item ->> 'material_code'), '') end;
    select * into v_material from public.inventory_materials
    where company_id = public.current_company_id() and catalog_id = v_catalog.id and unit = v_catalog.unit
      and coalesce(material_code, '') = coalesce(v_code, '')
    for update;
    if not found then
      insert into public.inventory_materials (catalog_id, material_code, material_name, category_id, material_type, size, unit,
        stock_quantity, notes, created_by, updated_by)
      values (v_catalog.id, v_code, v_catalog.material_name, v_catalog.category_id, v_catalog.material_type, v_catalog.size,
        v_catalog.unit, 0, v_catalog.notes, auth.uid(), auth.uid())
      returning * into v_material;
    end if;
    v_balance := public.inventory_adjust_stock(v_material.id, v_receipt.location_id, v_qty);
    insert into public.inventory_receipt_items (receipt_id, material_id, quantity) values (p_receipt_id, v_material.id, v_qty);
    insert into public.inventory_movements (material_id, movement_type, quantity, description, balance_after, created_by,
      action_type, target_location_id, receipt_date, received_by, dispatch_number, receipt_id)
    values (v_material.id, 'in', v_qty, p_description, v_balance, auth.uid(), 'in', v_receipt.location_id,
      v_receipt.receipt_date, v_receipt.received_by, v_receipt.dispatch_number, p_receipt_id);
  end loop;
end;
$$;

revoke all on function public.inventory_branch_location(uuid) from public, anon, authenticated;
revoke all on function public.inventory_check_receipt_items(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.inventory_post_receipt(uuid, jsonb, text) from public, anon, authenticated;

-- 4. İrsaliye ile stok girişi ve onayı ------------------------------------------------------------

create or replace function public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text,
  p_notes text, p_items jsonb, p_location_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid; v_location uuid; v_branch uuid; v_direct boolean := public.is_head_office();
begin
  if not (public.has_module_write_permission('inventory') or public.current_user_role() = 'accounting') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by, ''))) < 2
     or char_length(trim(coalesce(p_dispatch_number, ''))) < 1 then
    raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu';
  end if;
  v_location := public.inventory_resolve_location(p_location_id);
  perform public.inventory_require_branch_access(v_location);
  perform public.inventory_check_receipt_items(p_items, null);
  select branch_id into v_branch from public.inventory_locations where id = v_location;

  insert into public.inventory_receipts (receipt_date, received_by, dispatch_number, notes, created_by,
    location_id, branch_id, status, approved_by, approved_at)
  values (p_receipt_date, trim(p_received_by), trim(p_dispatch_number), nullif(trim(p_notes), ''), auth.uid(),
    v_location, v_branch, case when v_direct then 'approved' else 'pending' end,
    case when v_direct then auth.uid() end, case when v_direct then now() end)
  returning id into v_id;

  if v_direct then
    perform public.inventory_post_receipt(v_id, p_items, 'İrsaliye ile stok girişi');
  else
    insert into public.inventory_receipt_lines (receipt_id, catalog_id, material_code, quantity)
    select v_id, c.id, case when c.has_id then nullif(trim(x ->> 'material_code'), '') end, (x ->> 'quantity')::numeric
    from jsonb_array_elements(p_items) x
    join public.inventory_catalog c on c.id = (x ->> 'catalog_id')::uuid and c.company_id = public.current_company_id();
  end if;
  return v_id;
end;
$$;

-- Onay: satırlar irsaliyenin deposuna işlenir. Ret: irsaliye silinir.
create function public.review_inventory_receipt(p_receipt_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_items jsonb;
begin
  if not public.is_head_office() then
    raise exception 'İrsaliyeyi firma yöneticisi veya Merkez şantiye şefi onaylar' using errcode = '42501';
  end if;
  perform 1 from public.inventory_receipts
  where id = p_receipt_id and company_id = public.current_company_id() and status = 'pending'
  for update;
  if not found then raise exception 'Onay bekleyen irsaliye bulunamadı'; end if;

  if not p_approve then
    delete from public.inventory_receipts where id = p_receipt_id;
    return;
  end if;

  select jsonb_agg(jsonb_build_object('catalog_id', catalog_id, 'material_code', material_code, 'quantity', quantity))
  into v_items
  from public.inventory_receipt_lines where receipt_id = p_receipt_id;
  delete from public.inventory_receipt_lines where receipt_id = p_receipt_id;
  update public.inventory_receipts set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_receipt_id;
  perform public.inventory_post_receipt(p_receipt_id, v_items, 'İrsaliye ile stok girişi (onaylı)');
end;
$$;

revoke all on function public.review_inventory_receipt(uuid, boolean) from public, anon;
grant execute on function public.review_inventory_receipt(uuid, boolean) to authenticated;

-- 5. Malzeme talebi ---------------------------------------------------------------------------------

drop function public.create_inventory_request(date, text, text, jsonb);
create function public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb,
  p_branch_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request_id uuid; v_item jsonb; v_new jsonb; v_catalog_id uuid; v_qty numeric; v_unit public.inventory_unit;
  v_branch uuid := coalesce(p_branch_id, public.default_branch_for(public.current_company_id()));
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep yetkisi gerekli' using errcode = '42501'; end if;
  if not public.can_access_branch(v_branch) then raise exception 'Bu şubeye talep açamazsınız' using errcode = '42501'; end if;
  if p_request_date is null or char_length(trim(coalesce(p_requested_by, ''))) < 2 then raise exception 'Talep tarihi ve talep eden zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'En az bir talep kalemi eklenmelidir'; end if;
  insert into public.inventory_requests (request_date, requested_by, notes, created_by, branch_id)
  values (p_request_date, trim(p_requested_by), nullif(trim(p_notes), ''), auth.uid(), v_branch) returning id into v_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if nullif(v_item ->> 'catalog_id', '') is not null then
      v_catalog_id := (v_item ->> 'catalog_id')::uuid;
      select unit into v_unit from public.inventory_catalog where company_id = public.current_company_id() and id = v_catalog_id;
      if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    else
      v_new := v_item -> 'new_catalog';
      if v_new is null or char_length(trim(coalesce(v_new ->> 'material_name', ''))) < 2 then raise exception 'Yeni malzeme adı zorunlu'; end if;
      v_unit := (v_new ->> 'unit')::public.inventory_unit;
      insert into public.inventory_catalog (material_name, category_id, material_type, size, unit, has_id, notes, created_by)
      values (trim(v_new ->> 'material_name'), public.inventory_check_category(nullif(v_new ->> 'category_id', '')::uuid),
        nullif(trim(v_new ->> 'material_type'), ''), nullif(trim(v_new ->> 'size'), ''), v_unit,
        coalesce((v_new ->> 'has_id')::boolean, false), nullif(trim(v_new ->> 'notes'), ''), auth.uid())
      returning id into v_catalog_id;
    end if;
    if v_unit = 'piece' and v_qty <> trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    insert into public.inventory_request_items (request_id, catalog_id, quantity) values (v_request_id, v_catalog_id, v_qty);
  end loop;
  return v_request_id;
end;
$$;

revoke all on function public.create_inventory_request(date, text, text, jsonb, uuid) from public, anon;
grant execute on function public.create_inventory_request(date, text, text, jsonb, uuid) to authenticated;

create or replace function public.approve_inventory_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_head_office() then
    raise exception 'Talebi firma yöneticisi veya Merkez şantiye şefi onaylar' using errcode = '42501';
  end if;
  update public.inventory_requests set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = p_request_id and company_id = public.current_company_id() and status = 'requested';
  if not found then raise exception 'Yalnızca talep edilmiş kayıt onaylanabilir'; end if;
end;
$$;

revoke all on function public.approve_inventory_request(uuid) from public, anon;
grant execute on function public.approve_inventory_request(uuid) to authenticated;

-- İrsaliye kontrolü: talebin şubesindeki bir depo seçilir (boşsa şubenin deposu).
drop function public.submit_inventory_request_receipt(uuid, date, text, text, text, jsonb);
create function public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text,
  p_dispatch_number text, p_notes text default null, p_items jsonb default '[]'::jsonb, p_location_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request public.inventory_requests; v_item jsonb; v_catalog public.inventory_catalog; v_qty numeric; v_code text;
  v_location uuid;
begin
  if not (public.has_module_write_permission('inventory') or public.current_user_role() = 'accounting') then
    raise exception 'Stok kabul yetkisi gerekli' using errcode = '42501';
  end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by, ''))) < 2
     or char_length(trim(coalesce(p_dispatch_number, ''))) < 1 then
    raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu';
  end if;
  select * into v_request from public.inventory_requests
  where company_id = public.current_company_id() and id = p_request_id for update;
  if not found or not public.can_access_branch(v_request.branch_id) then raise exception 'Talep bulunamadı'; end if;
  if v_request.status <> 'approved' then raise exception 'Yalnızca onaylanmış talep stoğa alınabilir'; end if;
  v_location := coalesce(p_location_id, public.inventory_branch_location(v_request.branch_id));
  if v_location is null or not exists (select 1 from public.inventory_locations
      where id = v_location and company_id = public.current_company_id() and branch_id = v_request.branch_id) then
    raise exception 'Malzeme talebin şubesindeki bir depoya girer';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'İrsaliyede en az bir malzeme olmalıdır';
  end if;
  delete from public.inventory_request_receipt_items where company_id = public.current_company_id() and request_id = p_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where company_id = public.current_company_id() and id = (v_item ->> 'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit = 'piece' and v_qty <> trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    v_code := nullif(trim(v_item ->> 'material_code'), '');
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu', v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code := null; end if;
    if v_code is not null and exists (select 1 from public.inventory_materials
        where company_id = public.current_company_id() and lower(trim(material_code)) = lower(v_code)) then
      raise exception 'Bu malzeme ID daha önce kullanılmış: %', v_code;
    end if;
    insert into public.inventory_request_receipt_items (request_id, catalog_id, quantity, material_code)
    values (p_request_id, v_catalog.id, v_qty, v_code);
  end loop;
  update public.inventory_requests set status = 'receipt_review', location_id = v_location,
    pending_receipt_date = p_receipt_date, pending_received_by = trim(p_received_by),
    pending_dispatch_number = trim(p_dispatch_number), pending_receipt_notes = nullif(trim(p_notes), '')
  where id = p_request_id;
end;
$$;

revoke all on function public.submit_inventory_request_receipt(uuid, date, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.submit_inventory_request_receipt(uuid, date, text, text, text, jsonb, uuid) to authenticated;

-- Stok onayı: talebin deposuna (seçilmediyse şubenin deposuna) işlenir.
create or replace function public.approve_inventory_request_receipt(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request public.inventory_requests; v_receipt_id uuid; v_location uuid; v_items jsonb;
begin
  if not public.is_head_office() then
    raise exception 'Stok girişini firma yöneticisi veya Merkez şantiye şefi onaylar' using errcode = '42501';
  end if;
  select * into v_request from public.inventory_requests
  where company_id = public.current_company_id() and id = p_request_id for update;
  if not found or v_request.status <> 'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  v_location := coalesce(v_request.location_id, public.inventory_branch_location(v_request.branch_id),
    public.inventory_main_location(public.current_company_id()));

  insert into public.inventory_receipts (receipt_date, received_by, dispatch_number, notes, created_by,
    location_id, branch_id, status, approved_by, approved_at)
  select v_request.pending_receipt_date, v_request.pending_received_by, v_request.pending_dispatch_number,
    v_request.pending_receipt_notes, auth.uid(), v_location, l.branch_id, 'approved', auth.uid(), now()
  from public.inventory_locations l where l.id = v_location
  returning id into v_receipt_id;

  select jsonb_agg(jsonb_build_object('catalog_id', catalog_id, 'material_code', material_code, 'quantity', quantity))
  into v_items
  from public.inventory_request_receipt_items
  where company_id = public.current_company_id() and request_id = p_request_id;
  perform public.inventory_post_receipt(v_receipt_id, v_items, 'Malzeme talebinden irsaliye ile stok girişi');

  update public.inventory_requests set status = 'received', received_at = now(), receipt_id = v_receipt_id, location_id = v_location
  where id = p_request_id;
  return v_receipt_id;
end;
$$;

-- 6. Bildirimler: onay bekleyen irsaliye ve talepler de ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_chief boolean;
  v_users boolean;
  v_projects boolean;
  v_vehicles boolean;
  v_hakedis boolean;
begin
  if auth.uid() is null or v_company is null or public.current_user_role() = 'pending' then
    return '[]'::jsonb;
  end if;
  v_chief := public.is_site_chief();
  v_users := public.can_manage_users();
  v_projects := public.can_view_all() or public.has_module_write_permission('projects');
  v_vehicles := public.can_view_all() or public.has_module_write_permission('vehicles');
  v_hakedis := public.has_module_write_permission('hakedis');

  return (
    with items as (
      -- Katılım isteği
      select 'join:' || p.id as key, 'join_request' as type, 'Katılım isteği' as title,
             coalesce(nullif(p.full_name, ''), p.email) || ' firmanıza katılmak istiyor.' as body,
             '/panel/users' as link, p.created_at as at
      from public.profiles p
      where v_users and p.company_id = v_company and not p.is_approved and p.role = 'pending'

      union all
      -- Onay bekleyen personel / araç: firma yöneticisi ve Merkez şantiye şefi onaylar
      select 'pending_' || x.kind || ':' || x.n || ':' || extract(epoch from x.at)::bigint, 'pending_approval',
             case x.kind when 'personnel' then 'Onay bekleyen personel' else 'Onay bekleyen araç' end,
             x.n || case x.kind when 'personnel' then ' personel' else ' araç' end || ' kaydı onayınızı bekliyor.',
             '/panel/approvals', x.at
      from (
        select 'personnel' as kind, count(*) as n, max(created_at) as at
        from public.personnel where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
        union all
        select 'vehicle', count(*), max(created_at)
        from public.vehicles where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
      ) x
      where public.is_head_office() and x.n > 0

      union all
      -- Onay bekleyen irsaliye ve malzeme talepleri (talep onayı veya stok girişi onayı)
      select 'pending_stock:' || s.n || ':' || extract(epoch from s.at)::bigint, 'pending_approval', 'Onay bekleyen stok işlemi',
             s.n || ' irsaliye / malzeme talebi onayınızı bekliyor.', '/panel/approvals', s.at
      from (
        select count(*) as n, max(q.at) as at from (
          select r.created_at as at from public.inventory_receipts r
          where r.company_id = v_company and r.status = 'pending' and public.can_access_branch(r.branch_id)
          union all
          select q.created_at from public.inventory_requests q
          where q.company_id = v_company and q.status in ('requested', 'receipt_review') and public.can_access_branch(q.branch_id)
        ) q
      ) s
      where public.is_head_office() and s.n > 0

      union all
      -- Geçen ayın puantajı onaylanmadı
      select 'attendance_month:' || to_char(m.month_start, 'YYYY-MM') || ':' || b.id, 'attendance_approval', 'Puantaj onayı bekliyor',
             b.name || ' · ' || to_char(m.month_start, 'MM.YYYY') || ' puantajı henüz onaylanmadı. Onaylanınca ay kesinleşir.',
             '/panel/attendance?year=' || extract(year from m.month_start)::integer || '&month=' || extract(month from m.month_start)::integer,
             (m.month_start + interval '1 month')::timestamptz
      from (select (date_trunc('month', v_today) - interval '1 month')::date as month_start) m
      cross join public.branches b
      where v_users
        and b.company_id = v_company
        and public.can_access_branch(b.id)
        and exists (
          select 1 from public.attendance_records a
          join public.personnel p on p.id = a.personnel_id
          where a.company_id = v_company and p.branch_id = b.id
            and a.attendance_date >= m.month_start and a.attendance_date < m.month_start + interval '1 month')
        and not public.attendance_month_is_locked(v_company, b.id, m.month_start)

      union all
      -- Destek talebi yanıtı (son 30 gün)
      select 'support:' || s.id || ':' || extract(epoch from s.replied_at)::bigint, 'support_reply',
             'Destek talebiniz yanıtlandı', left(coalesce(s.admin_reply, ''), 160), '/panel/support', s.replied_at
      from public.support_requests s
      where v_chief and s.company_id = v_company and s.replied_at is not null and s.replied_at > now() - interval '30 days'

      union all
      -- Geciken proje
      select 'project_delayed:' || p.id || ':' || coalesce(p.estimated_end_date::text, ''), 'project_delayed', 'Proje gecikti',
             concat_ws(' · ', p.name, p.project_code) || coalesce(' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'), ''),
             '/panel/projects/' || p.id, coalesce(p.estimated_end_date + 1, p.delayed_at, v_today)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
        and p.status <> 'completed'
        and (p.status = 'delayed' or p.estimated_end_date < v_today)

      union all
      -- Bitişi 3 gün içinde olan proje
      select 'project_due:' || p.id || ':' || p.estimated_end_date, 'project_due', 'Proje bitişi yaklaşıyor',
             concat_ws(' · ', p.name, p.project_code) || ' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'),
             '/panel/projects/' || p.id, (p.estimated_end_date - 3)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
        and p.status not in ('completed', 'delayed')
        and p.estimated_end_date between v_today and v_today + 3

      union all
      -- Araç muayene / sigorta (15 gün içinde veya geçmiş)
      select 'vehicle_' || d.kind || ':' || v.id || ':' || d.due, 'vehicle_deadline',
             case d.kind when 'inspection' then 'Araç muayenesi' else 'Araç sigortası' end
               || case when d.due < v_today then ' tarihi geçti' else ' yaklaşıyor' end,
             v.plate || ' — ' || to_char(d.due, 'DD.MM.YYYY'), '/panel/vehicles', (d.due - 15)::timestamptz
      from public.vehicles v
      cross join lateral (values ('inspection', v.inspection_date), ('insurance', v.insurance_date)) as d(kind, due)
      where v_vehicles and v.company_id = v_company and public.can_access_branch(v.branch_id) and d.due is not null and d.due <= v_today + 15

      union all
      -- Deneme süresi son 24 saat
      select 'trial_end:' || extract(epoch from c.trial_ends_at)::bigint, 'subscription', 'Deneme süresi bitiyor',
             'Deneme süreniz ' || to_char(timezone('Europe/Istanbul', c.trial_ends_at), 'DD.MM.YYYY HH24:MI')
               || ' tarihinde bitiyor. Plan talebi için Destek sayfasını kullanın.',
             '/panel/support', c.trial_ends_at - interval '24 hours'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is null
        and c.trial_ends_at between now() and now() + interval '24 hours'

      union all
      -- Plan bitişi son 7 gün
      select 'plan_end:' || extract(epoch from c.plan_ends_at)::bigint, 'subscription', 'Plan süresi bitiyor',
             'Planınız ' || to_char(timezone('Europe/Istanbul', c.plan_ends_at), 'DD.MM.YYYY') || ' tarihinde bitiyor. Yenilemek için Destek sayfasını kullanın.',
             '/panel/support', c.plan_ends_at - interval '7 days'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is not null and c.plan_ends_at is not null
        and c.plan_ends_at between now() and now() + interval '7 days'

      union all
      -- Fiyatı girilmemiş hakediş kayıtları (son 31 gün)
      select 'hakedis_unpriced:' || u.n, 'hakedis_unpriced', 'Fiyatı girilmemiş kayıtlar',
             u.n || ' iş kaydının veya ek işin fiyatı girilmemiş; hakediş toplamına dahil değil.',
             '/panel/hakedis', now()
      from (
        select (
          (select count(*) from public.project_stage_logs l
           left join public.hakedis_log_values hv on hv.log_id = l.id
           join public.project_stage_progress sp on sp.id = l.progress_id
           join public.projects pr on pr.id = sp.project_id
           where l.company_id = v_company and l.quantity is not null and hv.log_id is null
             and public.can_access_branch(pr.branch_id)
             and l.log_date >= v_today - 31)
          +
          (select count(*) from public.production_items i
           join public.production_jobs j on j.id = i.production_job_id
           join public.production_entries e on e.id = j.production_entry_id
           left join public.hakedis_extra_values x on x.production_item_id = i.id
           where i.company_id = v_company and i.kind = 'extra' and x.production_item_id is null
             and public.can_access_branch(e.branch_id)
             and e.work_date >= v_today - 31)
        ) as n
      ) u
      where v_hakedis and u.n > 0
    ),
    latest as (
      select * from items order by at desc limit 50
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', l.key, 'type', l.type, 'title', l.title, 'body', l.body, 'link', l.link, 'at', l.at,
      'read', r.key is not null
    ) order by l.at desc), '[]'::jsonb)
    from latest l
    left join public.notification_reads r on r.user_id = auth.uid() and r.key = l.key
  );
end;
$function$;
