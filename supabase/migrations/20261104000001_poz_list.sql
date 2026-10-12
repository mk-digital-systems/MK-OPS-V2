-- Firma poz listesi (F2)
--
--   * Poz = project_type_stages satırı; türe değil kataloğa (sektöre) bağlıdır:
--       project_type_id null, project_id null, catalog_id dolu.
--     Grup başlığı, poz no (elle, 3–5 karakter), ad, birim, aktif/pasif. Katalog içinde ad ve poz no tekildir.
--     Türe bağlı eski kalemler F3'te bu yapıya taşınacak; şimdilik oldukları gibi çalışır.
--   * poz_prices: yürürlük tarihli birim fiyat geçmişi. Bir tarihteki fiyat, o tarihten önceki ya da o tarihteki
--     en son kayıttır (poz_price_at). İmalat/hakediş bağlantısı F3'te.
--   * Düzenleme: süper admin (her firma) ve firmada Merkez yetkisi olanlar (firma yöneticisi + Merkez şefi).
--     Fiyat: süper admin ve hakediş yetkisi olanlar.
--   * Kullanılmış poz silinmez, pasife alınır.
--   Bütün fonksiyonlar p_company_id alır: süper admin firmayı seçer; firma kullanıcısı için null = kendi firması.

-- 1. Poz: kalem tablosu genişler -------------------------------------------------------------------
alter table public.project_type_stages alter column project_type_id drop not null;
alter table public.project_type_stages
  add column catalog_id uuid references public.catalogs (id) on delete restrict,
  add column group_name text check (group_name is null or char_length(group_name) <= 80),
  add column is_active boolean not null default true,
  add constraint project_type_stages_poz_scope check (project_type_id is not null or (project_id is null and catalog_id is not null));

comment on column public.project_type_stages.catalog_id is 'Firma pozunun kataloğu (sektörü); türe bağlı eski kalemlerde boş';
comment on column public.project_type_stages.group_name is 'Poz listesinde grup başlığı (ör. Kablo, Ek, Kazı)';
comment on column public.project_type_stages.is_active is 'Pasif poz yeni imalatta listelenmez';

create unique index project_type_stages_poz_name_unique
  on public.project_type_stages (company_id, catalog_id, lower(trim(name))) where project_type_id is null;
create unique index project_type_stages_poz_code_unique
  on public.project_type_stages (company_id, catalog_id, lower(poz_code)) where project_type_id is null and poz_code is not null;
create index idx_project_type_stages_catalog on public.project_type_stages (company_id, catalog_id) where project_type_id is null;

-- 2. Yürürlük tarihli fiyat -------------------------------------------------------------------------
create table public.poz_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  stage_id uuid not null,
  valid_from date not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint poz_prices_stage_fkey foreign key (company_id, stage_id)
    references public.project_type_stages (company_id, id) on delete cascade,
  constraint poz_prices_stage_date_key unique (stage_id, valid_from)
);
create index idx_poz_prices_company on public.poz_prices (company_id);

comment on table public.poz_prices is 'Pozun yürürlük tarihli birim fiyatı; bir tarihteki fiyat o güne kadarki son kayıttır';

alter table public.poz_prices enable row level security;
revoke all on public.poz_prices from anon;
revoke insert, update, delete on public.poz_prices from authenticated;
create policy "company_isolation" on public.poz_prices as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "poz_prices_select_hakedis" on public.poz_prices for select to authenticated
  using ((select public.has_module_write_permission('hakedis')));
create trigger zz_audit_row_change after insert or update or delete on public.poz_prices
for each row execute function public.audit_row_change('hakedis');

create function public.poz_price_at(p_stage_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select unit_price from public.poz_prices
  where stage_id = p_stage_id and valid_from <= p_date
  order by valid_from desc
  limit 1;
$$;

-- 3. Yetki yardımcıları ----------------------------------------------------------------------------
-- Firma: süper admin seçtiği firmayı, diğerleri yalnızca kendi firmasını.
create function public.poz_company(p_company_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := coalesce(p_company_id, public.current_company_id());
begin
  if v_company is null then
    raise exception 'Firma seçilmedi';
  end if;
  if public.is_super_admin() then
    if not exists (select 1 from public.companies where id = v_company) then
      raise exception 'Şirket bulunamadı';
    end if;
    return v_company;
  end if;
  if v_company is distinct from public.current_company_id() or public.current_user_role() = 'pending' then
    raise exception 'Bu firmanın poz listesine erişiminiz yok' using errcode = '42501';
  end if;
  return v_company;
end;
$$;

create function public.poz_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin() or public.is_head_office();
$$;

create function public.poz_can_price()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin() or public.has_module_write_permission('hakedis');
$$;

-- 4. Okuma: firmanın katalogları (önerilen kalemleriyle), pozları ve (yetkiliyse) fiyat geçmişi -------
create function public.get_poz_list(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
  v_price boolean := public.poz_can_price();
begin
  return jsonb_build_object(
    'currency_code', (select currency_code from public.companies where id = v_company),
    'can_edit', public.poz_can_edit(),
    'can_price', v_price,
    'catalogs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('group_name', i.group_name, 'poz_code', i.poz_code, 'name', i.name, 'unit', i.unit)
            order by i.sort_order)
          from public.catalog_poz_items i where i.catalog_id = c.id), '[]'::jsonb)
      ) order by c.sort_order, c.name)
      from public.company_catalogs cc
      join public.catalogs c on c.id = cc.catalog_id
      where cc.company_id = v_company
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'catalog_id', s.catalog_id,
        'group_name', s.group_name,
        'poz_code', s.poz_code,
        'name', s.name,
        'unit', s.unit,
        'is_active', s.is_active,
        'sort_order', s.sort_order,
        'used', exists (select 1 from public.project_stage_progress sp where sp.stage_id = s.id)
      ) order by s.sort_order, s.name)
      from public.project_type_stages s
      where s.company_id = v_company and s.project_type_id is null
    ), '[]'::jsonb),
    'prices', case when v_price then coalesce((
      select jsonb_agg(jsonb_build_object('stage_id', p.stage_id, 'valid_from', p.valid_from, 'unit_price', p.unit_price)
        order by p.valid_from)
      from public.poz_prices p
      where p.company_id = v_company
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- 5. Yazma ----------------------------------------------------------------------------------------
create function public.save_poz_item(
  p_company_id uuid,
  p_id uuid,
  p_catalog_id uuid,
  p_group_name text,
  p_poz_code text,
  p_name text,
  p_unit text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
  v_id uuid := p_id;
begin
  if not public.poz_can_edit() then
    raise exception 'Poz listesini firma yöneticisi ve Merkez şantiye şefi düzenler' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Poz adı boş olamaz';
  end if;
  begin
    if v_id is null then
      if not exists (select 1 from public.company_catalogs where company_id = v_company and catalog_id = p_catalog_id) then
        raise exception 'Bu katalog firmaya atanmamış';
      end if;
      insert into public.project_type_stages (company_id, project_type_id, project_id, catalog_id, group_name, poz_code, name, unit, is_active, sort_order)
      values (v_company, null, null, p_catalog_id, nullif(trim(p_group_name), ''), nullif(trim(p_poz_code), ''), trim(p_name),
              nullif(trim(p_unit), ''), coalesce(p_is_active, true),
              coalesce((select max(sort_order) + 1 from public.project_type_stages
                        where company_id = v_company and catalog_id = p_catalog_id and project_type_id is null), 1))
      returning id into v_id;
    else
      update public.project_type_stages
      set group_name = nullif(trim(p_group_name), ''),
          poz_code = nullif(trim(p_poz_code), ''),
          name = trim(p_name),
          unit = nullif(trim(p_unit), ''),
          is_active = coalesce(p_is_active, is_active)
      where id = v_id and company_id = v_company and project_type_id is null;
      if not found then raise exception 'Poz bulunamadı'; end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Bu katalogda aynı ad veya aynı poz no ile bir poz var: %', coalesce(nullif(trim(p_poz_code), ''), trim(p_name));
    when check_violation then
      raise exception 'Poz no 3–5 karakter olmalı: %', trim(p_poz_code);
  end;
  return v_id;
end;
$$;

-- p_items: [{ "group_name", "poz_code", "name", "unit", "unit_price" }, …]
-- Poz no varsa poz no ile, yoksa ad ile eşleşen poz güncellenir; eşleşmeyen eklenir. Fiyat verilen satırlar
-- p_valid_from tarihli fiyat olarak yazılır (hakediş yetkisi gerekir).
create function public.import_poz_items(p_company_id uuid, p_catalog_id uuid, p_items jsonb, p_valid_from date)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
  v_item jsonb;
  v_index integer := 0;
  v_id uuid;
  v_code text;
  v_name text;
  v_price numeric;
  v_priced integer := 0;
begin
  if not public.poz_can_edit() then
    raise exception 'Poz listesini firma yöneticisi ve Merkez şantiye şefi düzenler' using errcode = '42501';
  end if;
  if not exists (select 1 from public.company_catalogs where company_id = v_company and catalog_id = p_catalog_id) then
    raise exception 'Bu katalog firmaya atanmamış';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Aktarılacak poz yok';
  end if;
  if jsonb_array_length(p_items) > 2000 then
    raise exception 'Bir seferde en fazla 2000 poz aktarılabilir';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where nullif(trim(x ->> 'unit_price'), '') is not null)
    and not public.poz_can_price() then
    raise exception 'Fiyat girmek için hakediş yetkisi gerekli' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    v_code := nullif(trim(v_item ->> 'poz_code'), '');
    v_name := trim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      raise exception '%. satırda poz adı boş', v_index;
    end if;
    v_id := null;
    if v_code is not null then
      select id into v_id from public.project_type_stages
      where company_id = v_company and catalog_id = p_catalog_id and project_type_id is null and lower(poz_code) = lower(v_code);
    end if;
    if v_id is null then
      select id into v_id from public.project_type_stages
      where company_id = v_company and catalog_id = p_catalog_id and project_type_id is null and lower(trim(name)) = lower(v_name);
    end if;
    begin
      v_id := public.save_poz_item(v_company, v_id, p_catalog_id, v_item ->> 'group_name', v_code, v_name,
                                   v_item ->> 'unit', case when v_id is null then true end);
    exception
      when others then
        raise exception '%. satır (%): %', v_index, v_name, sqlerrm;
    end;
    v_price := nullif(trim(replace(coalesce(v_item ->> 'unit_price', ''), ',', '.')), '')::numeric;
    if v_price is not null then
      perform public.set_poz_price(v_company, v_id, v_price, coalesce(p_valid_from, current_date));
      v_priced := v_priced + 1;
    end if;
  end loop;

  return jsonb_build_object('count', v_index, 'priced', v_priced);
end;
$$;

create function public.delete_poz_item(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
begin
  if not public.poz_can_edit() then
    raise exception 'Poz listesini firma yöneticisi ve Merkez şantiye şefi düzenler' using errcode = '42501';
  end if;
  if exists (select 1 from public.project_stage_progress where stage_id = p_id) then
    raise exception 'Bu poz projelerde kullanılmış; silmek yerine pasife alın';
  end if;
  delete from public.project_type_stages where id = p_id and company_id = v_company and project_type_id is null;
  if not found then raise exception 'Poz bulunamadı'; end if;
end;
$$;

-- Fiyat: p_unit_price null ise o tarihteki fiyat kaydı silinir.
create function public.set_poz_price(p_company_id uuid, p_stage_id uuid, p_unit_price numeric, p_valid_from date)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
begin
  if not public.poz_can_price() then
    raise exception 'Fiyat girmek için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  if p_valid_from is null then
    raise exception 'Yürürlük tarihi zorunlu';
  end if;
  if not exists (select 1 from public.project_type_stages where id = p_stage_id and company_id = v_company and project_type_id is null) then
    raise exception 'Poz bulunamadı';
  end if;
  if p_unit_price is null then
    delete from public.poz_prices where stage_id = p_stage_id and valid_from = p_valid_from;
    return;
  end if;
  if p_unit_price < 0 then
    raise exception 'Birim fiyat negatif olamaz';
  end if;
  insert into public.poz_prices (company_id, stage_id, valid_from, unit_price)
  values (v_company, p_stage_id, p_valid_from, round(p_unit_price, 2))
  on conflict (stage_id, valid_from) do update
    set unit_price = excluded.unit_price, created_by = auth.uid(), created_at = now();
end;
$$;

-- Toplu fiyat güncellemesi (eskalasyon): seçilen kapsamdaki aktif pozların p_valid_from tarihindeki fiyatı
-- yüzde kadar artırılıp (ya da azaltılıp) o tarihten geçerli yeni fiyat olarak yazılır; fiyatı olmayan atlanır.
create function public.bulk_adjust_poz_prices(
  p_company_id uuid,
  p_catalog_id uuid,
  p_group_name text,
  p_percent numeric,
  p_valid_from date
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.poz_company(p_company_id);
  v_row record;
  v_count integer := 0;
begin
  if not public.poz_can_price() then
    raise exception 'Fiyat girmek için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  if p_percent is null or p_percent = 0 or p_percent < -90 or p_percent > 500 then
    raise exception 'Yüzde -90 ile 500 arasında ve sıfırdan farklı olmalı';
  end if;
  if p_valid_from is null then
    raise exception 'Yürürlük tarihi zorunlu';
  end if;

  for v_row in
    select s.id, public.poz_price_at(s.id, p_valid_from) as price
    from public.project_type_stages s
    where s.company_id = v_company and s.project_type_id is null and s.is_active
      and (p_catalog_id is null or s.catalog_id = p_catalog_id)
      and (nullif(trim(p_group_name), '') is null or lower(coalesce(s.group_name, '')) = lower(trim(p_group_name)))
  loop
    continue when v_row.price is null;
    insert into public.poz_prices (company_id, stage_id, valid_from, unit_price)
    values (v_company, v_row.id, p_valid_from, round(v_row.price * (1 + p_percent / 100), 2))
    on conflict (stage_id, valid_from) do update
      set unit_price = excluded.unit_price, created_by = auth.uid(), created_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 6. Katalog: firmanın pozu varken silinemez ------------------------------------------------------
create or replace function public.admin_delete_catalog(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();
  if exists (select 1 from public.company_catalogs where catalog_id = p_id) then
    raise exception 'Bu katalog firmalara atanmış; önce firmalardan kaldırın';
  end if;
  if exists (select 1 from public.project_type_stages where catalog_id = p_id) then
    raise exception 'Bu kataloğa bağlı firma pozları var; katalog silinemez';
  end if;
  delete from public.catalogs where id = p_id;
  if not found then raise exception 'Katalog bulunamadı'; end if;
end;
$$;

-- 7. Yetkiler -------------------------------------------------------------------------------------
revoke all on function public.poz_company(uuid) from public, anon, authenticated;
revoke all on function public.poz_can_edit() from public, anon, authenticated;
revoke all on function public.poz_can_price() from public, anon, authenticated;
revoke all on function public.poz_price_at(uuid, date) from public, anon, authenticated;
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.get_poz_list(uuid)',
    'public.save_poz_item(uuid, uuid, uuid, text, text, text, text, boolean)',
    'public.import_poz_items(uuid, uuid, jsonb, date)',
    'public.delete_poz_item(uuid, uuid)',
    'public.set_poz_price(uuid, uuid, numeric, date)',
    'public.bulk_adjust_poz_prices(uuid, uuid, text, numeric, date)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated, service_role', v_fn);
  end loop;
end $$;
