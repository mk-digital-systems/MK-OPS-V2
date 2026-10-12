-- Kataloglar (F1): süper admin'in yönettiği sektör katalogları
--
--   * catalogs               Katalog (ör. Telekom Altyapı, İnşaat; ya da müşteriye özel: Kuaför, Fabrika)
--   * catalog_project_types  Katalogdaki proje türleri (ad, renk, ekran tipi: standart / HP / kurumsal)
--   * catalog_poz_items      Katalogdaki önerilen kalemler (grup, poz no, ad, birim); F2'de firmaya aktarılır
--   * company_catalogs       Firmaya atanan kataloglar (çoklu). Atanınca kataloğun türleri firmaya kurulur;
--                            katalogdaki tür değişince kurulu türler de güncellenir; katalog kaldırılınca
--                            kurulu türler arşivlenir (projeler etkilenmez).
--   * project_types.catalog_type_id  Firmadaki türün katalog bağı.
--
--   HP / Kurumsal ekranları artık kataloğa bağlıdır: firmanın kataloglarından birinde o ekran tipinde tür varsa açıktır.
--   Eklentisi açık firmalara "Telekom Altyapı" kataloğu atanır ve eklenti listesi boşaltılır.

-- 1. Tablolar --------------------------------------------------------------------------------------
create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  is_builtin boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index catalogs_name_unique on public.catalogs (lower(trim(name)));

comment on table public.catalogs is 'Süper admin kataloğu: proje türleri ve önerilen kalemler; firmalara atanır';

create table public.catalog_project_types (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  screen text not null default 'standard' check (screen in ('standard', 'hp', 'corporate')),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index catalog_project_types_name_unique on public.catalog_project_types (catalog_id, lower(trim(name)));

create table public.catalog_poz_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs (id) on delete cascade,
  group_name text check (group_name is null or char_length(group_name) <= 80),
  poz_code text check (poz_code is null or char_length(poz_code) between 1 and 20),
  name text not null check (char_length(trim(name)) between 1 and 200),
  unit text check (unit is null or char_length(unit) between 1 and 12),
  sort_order integer not null default 0
);
create index idx_catalog_poz_items_catalog on public.catalog_poz_items (catalog_id, sort_order);

create table public.company_catalogs (
  company_id uuid not null references public.companies (id) on delete cascade,
  catalog_id uuid not null references public.catalogs (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (company_id, catalog_id)
);
create index idx_company_catalogs_catalog on public.company_catalogs (catalog_id);

alter table public.project_types
  add column catalog_type_id uuid references public.catalog_project_types (id) on delete set null;
create unique index project_types_catalog_type_unique on public.project_types (company_id, catalog_type_id)
  where catalog_type_id is not null;

comment on column public.project_types.catalog_type_id is 'Katalogdan kurulan türün bağı (süper admin yönetir)';

create trigger catalogs_set_updated_at before update on public.catalogs
for each row execute function public.set_updated_at();
create trigger catalog_project_types_set_updated_at before update on public.catalog_project_types
for each row execute function public.set_updated_at();

-- 2. Güvenlik: yazma yalnızca süper admin fonksiyonlarıyla; firma kendi kataloglarını okur ---------
alter table public.catalogs enable row level security;
alter table public.catalog_project_types enable row level security;
alter table public.catalog_poz_items enable row level security;
alter table public.company_catalogs enable row level security;
revoke all on public.catalogs, public.catalog_project_types, public.catalog_poz_items, public.company_catalogs from anon;
revoke insert, update, delete on public.catalogs, public.catalog_project_types, public.catalog_poz_items, public.company_catalogs from authenticated;

create policy "company_catalogs_select" on public.company_catalogs for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_super_admin()));
create policy "catalogs_select" on public.catalogs for select to authenticated
  using ((select public.is_super_admin())
    or exists (select 1 from public.company_catalogs cc where cc.catalog_id = catalogs.id and cc.company_id = (select public.current_company_id())));
create policy "catalog_project_types_select" on public.catalog_project_types for select to authenticated
  using ((select public.is_super_admin())
    or exists (select 1 from public.company_catalogs cc where cc.catalog_id = catalog_project_types.catalog_id and cc.company_id = (select public.current_company_id())));
create policy "catalog_poz_items_select" on public.catalog_poz_items for select to authenticated
  using ((select public.is_super_admin())
    or exists (select 1 from public.company_catalogs cc where cc.catalog_id = catalog_poz_items.catalog_id and cc.company_id = (select public.current_company_id())));

-- 3. Kataloğun türlerini firmaya kurma (iç fonksiyon) ---------------------------------------------
-- Firmada bu katalog türüne bağlı tür varsa ad/renk/açıklama güncellenir ve arşivden çıkar; yoksa aynı adlı ve
-- aynı ekran tipli bağsız tür bağlanır; o da yoksa yeni tür açılır.
create function public.install_catalog_types(p_company_id uuid, p_catalog_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_type public.catalog_project_types;
  v_existing public.project_types;
begin
  for v_type in select * from public.catalog_project_types where catalog_id = p_catalog_id order by sort_order, name
  loop
    select * into v_existing from public.project_types
    where company_id = p_company_id and catalog_type_id = v_type.id;
    if v_existing.id is null then
      select * into v_existing from public.project_types
      where company_id = p_company_id and catalog_type_id is null and lower(trim(name)) = lower(trim(v_type.name));
      if v_existing.id is not null and v_existing.screen <> v_type.screen then
        raise exception 'Firmada "%" adında farklı ekran tipinde bir proje türü var; önce adını değiştirin', v_type.name;
      end if;
    end if;

    if v_existing.id is not null then
      update public.project_types
      set catalog_type_id = v_type.id,
          name = trim(v_type.name),
          description = v_type.description,
          color = coalesce(v_type.color, color),
          is_archived = false
      where id = v_existing.id;
    else
      insert into public.project_types (company_id, name, description, color, screen, has_sections, catalog_type_id, sort_order)
      values (p_company_id, trim(v_type.name), v_type.description, v_type.color, v_type.screen, false, v_type.id, v_type.sort_order);
    end if;
  end loop;
end;
$$;

-- 4. Süper admin: katalog, tür, önerilen kalem -----------------------------------------------------
create function public.admin_list_catalogs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'is_builtin', c.is_builtin,
      'sort_order', c.sort_order,
      'types', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description,
          'screen', t.screen, 'color', t.color, 'sort_order', t.sort_order) order by t.sort_order, t.name)
        from public.catalog_project_types t where t.catalog_id = c.id), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'group_name', i.group_name, 'poz_code', i.poz_code,
          'name', i.name, 'unit', i.unit, 'sort_order', i.sort_order) order by i.sort_order)
        from public.catalog_poz_items i where i.catalog_id = c.id), '[]'::jsonb),
      'company_ids', coalesce((
        select jsonb_agg(cc.company_id) from public.company_catalogs cc where cc.catalog_id = c.id), '[]'::jsonb)
    ) order by c.sort_order, c.name)
    from public.catalogs c
  ), '[]'::jsonb);
end;
$$;

create function public.admin_save_catalog(p_id uuid, p_name text, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid := p_id;
begin
  perform public.assert_super_admin();
  begin
    if v_id is null then
      insert into public.catalogs (name, description, sort_order)
      values (trim(p_name), nullif(trim(p_description), ''), coalesce((select max(sort_order) + 1 from public.catalogs), 0))
      returning id into v_id;
    else
      update public.catalogs set name = trim(p_name), description = nullif(trim(p_description), '') where id = v_id;
      if not found then raise exception 'Katalog bulunamadı'; end if;
    end if;
  exception
    when unique_violation then raise exception 'Bu adla bir katalog zaten var';
  end;
  return v_id;
end;
$$;

create function public.admin_delete_catalog(p_id uuid)
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
  delete from public.catalogs where id = p_id;
  if not found then raise exception 'Katalog bulunamadı'; end if;
end;
$$;

-- Tür eklenince/değişince kataloğun atandığı bütün firmalara kurulur.
create function public.admin_save_catalog_type(
  p_id uuid,
  p_catalog_id uuid,
  p_name text,
  p_screen text,
  p_color text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid := p_id;
  v_catalog_id uuid := p_catalog_id;
  v_company_id uuid;
begin
  perform public.assert_super_admin();
  if coalesce(p_screen, 'standard') not in ('standard', 'hp', 'corporate') then
    raise exception 'Geçersiz ekran tipi';
  end if;
  begin
    if v_id is null then
      insert into public.catalog_project_types (catalog_id, name, screen, color, description, sort_order)
      values (v_catalog_id, trim(p_name), coalesce(p_screen, 'standard'), nullif(trim(p_color), ''), nullif(trim(p_description), ''),
              coalesce((select max(sort_order) + 1 from public.catalog_project_types where catalog_id = v_catalog_id), 0))
      returning id into v_id;
    else
      select catalog_id into v_catalog_id from public.catalog_project_types where id = v_id;
      if v_catalog_id is null then raise exception 'Proje türü bulunamadı'; end if;
      if exists (select 1 from public.catalog_project_types where id = v_id and screen <> coalesce(p_screen, screen)) then
        raise exception 'Proje türünün ekran tipi değiştirilemez';
      end if;
      update public.catalog_project_types
      set name = trim(p_name), color = nullif(trim(p_color), ''), description = nullif(trim(p_description), '')
      where id = v_id;
    end if;
  exception
    when unique_violation then raise exception 'Bu katalogda aynı adla bir tür var';
    when foreign_key_violation then raise exception 'Katalog bulunamadı';
  end;

  for v_company_id in select company_id from public.company_catalogs where catalog_id = v_catalog_id
  loop
    perform public.install_catalog_types(v_company_id, v_catalog_id);
  end loop;
  return v_id;
end;
$$;

-- Türü silmek: firmalardaki kurulu kopyalar arşivlenir (projeler ve kayıtlar korunur).
create function public.admin_delete_catalog_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();
  update public.project_types set is_archived = true where catalog_type_id = p_id;
  delete from public.catalog_project_types where id = p_id;
  if not found then raise exception 'Proje türü bulunamadı'; end if;
end;
$$;

-- p_items: [{ "group_name", "poz_code", "name", "unit" }, …] sırasıyla; liste bütünüyle değişir.
create function public.admin_save_catalog_items(p_catalog_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_index integer := 0;
  v_item jsonb;
begin
  perform public.assert_super_admin();
  if not exists (select 1 from public.catalogs where id = p_catalog_id) then
    raise exception 'Katalog bulunamadı';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Geçersiz kalem listesi';
  end if;
  delete from public.catalog_poz_items where catalog_id = p_catalog_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    if char_length(trim(coalesce(v_item ->> 'name', ''))) = 0 then
      raise exception '%. kalemin adı boş olamaz', v_index;
    end if;
    insert into public.catalog_poz_items (catalog_id, group_name, poz_code, name, unit, sort_order)
    values (p_catalog_id, nullif(trim(v_item ->> 'group_name'), ''), nullif(trim(v_item ->> 'poz_code'), ''),
            trim(v_item ->> 'name'), nullif(trim(v_item ->> 'unit'), ''), v_index);
  end loop;
end;
$$;

-- 5. Süper admin: firmaya katalog atama -------------------------------------------------------------
create function public.admin_set_company_catalogs(p_company_id uuid, p_catalog_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_catalog_id uuid;
  v_ids uuid[] := coalesce(p_catalog_ids, '{}');
begin
  perform public.assert_super_admin();
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Şirket bulunamadı';
  end if;
  if exists (select 1 from unnest(v_ids) as x(id) where not exists (select 1 from public.catalogs c where c.id = x.id)) then
    raise exception 'Katalog bulunamadı';
  end if;

  -- Kaldırılan katalogların kurulu türleri arşivlenir.
  update public.project_types pt
  set is_archived = true
  from public.catalog_project_types ct
  where pt.company_id = p_company_id and pt.catalog_type_id = ct.id
    and not (ct.catalog_id = any (v_ids));
  delete from public.company_catalogs where company_id = p_company_id and not (catalog_id = any (v_ids));

  foreach v_catalog_id in array v_ids
  loop
    insert into public.company_catalogs (company_id, catalog_id) values (p_company_id, v_catalog_id)
    on conflict do nothing;
    perform public.install_catalog_types(p_company_id, v_catalog_id);
  end loop;
end;
$$;

-- 6. HP / Kurumsal ekranı: firmanın kataloglarından (geçiş için eski eklenti listesi de sayılır) --------
create or replace function public.company_has_project_addon(p_addon text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select p_addon = any (c.project_addons) from public.companies c where c.id = public.current_company_id()),
    false
  ) or exists (
    select 1 from public.company_catalogs cc
    join public.catalog_project_types ct on ct.catalog_id = cc.catalog_id
    where cc.company_id = public.current_company_id() and ct.screen = p_addon
  );
$$;

-- 7. Hazır katalog: Telekom Altyapı ----------------------------------------------------------------
do $$
declare
  v_catalog uuid;
  v_company uuid;
begin
  insert into public.catalogs (name, description, is_builtin, sort_order)
  values ('Telekom Altyapı', 'Fiber altyapı alt yüklenicileri: HP odaklı (paftalı) ve kurumsal projeler', true, 0)
  returning id into v_catalog;
  insert into public.catalog_project_types (catalog_id, name, screen, color, description, sort_order) values
    (v_catalog, 'HP Odaklı', 'hp', '#2563eb', 'Paftalar ve HP adetleriyle takip edilen fiber projeleri', 0),
    (v_catalog, 'Kurumsal', 'corporate', '#0891b2', 'Durumu elle takip edilen kurumsal hat projeleri', 1);

  -- Eklentisi açık firmalar telekom kataloğuna geçer.
  for v_company in select id from public.companies where cardinality(project_addons) > 0
  loop
    insert into public.company_catalogs (company_id, catalog_id) values (v_company, v_catalog);
    perform public.install_catalog_types(v_company, v_catalog);
  end loop;
  update public.companies set project_addons = '{}' where cardinality(project_addons) > 0;
end $$;

-- 8. Yetkiler -------------------------------------------------------------------------------------
revoke all on function public.install_catalog_types(uuid, uuid) from public, anon, authenticated;
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_list_catalogs()',
    'public.admin_save_catalog(uuid, text, text)',
    'public.admin_delete_catalog(uuid)',
    'public.admin_save_catalog_type(uuid, uuid, text, text, text, text)',
    'public.admin_delete_catalog_type(uuid)',
    'public.admin_save_catalog_items(uuid, jsonb)',
    'public.admin_set_company_catalogs(uuid, uuid[])'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated, service_role', v_fn);
  end loop;
end $$;
