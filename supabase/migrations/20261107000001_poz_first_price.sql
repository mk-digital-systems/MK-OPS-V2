-- Poz fiyatı: ilk fiyat başlangıçtan geçerli
--
--   Yürürlük tarihi verilmeden girilen fiyat:
--     * pozun hiç fiyatı yoksa (ilk fiyat) "başlangıçtan" (2000-01-01) geçerli olur; böylece fiyat girilmeden önce
--       yapılmış imalatlar da fiyatlanır (fiyatsız kayıtlar tetikleyiciyle fiyatlanır);
--     * pozun fiyatı varsa bugünden geçerli olur (zam).
--   Tarih verilirse o tarih kullanılır. Excel'den aktarmada da aynı kural her satıra ayrı uygulanır.

create function public.poz_default_valid_from(p_stage_id uuid, p_valid_from date)
returns date
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    p_valid_from,
    case when exists (select 1 from public.poz_prices where stage_id = p_stage_id)
         then timezone('Europe/Istanbul', now())::date
         else date '2000-01-01' end
  );
$$;

revoke all on function public.poz_default_valid_from(uuid, date) from public, anon, authenticated;

-- Gövdelerin geri kalanı 20261104000001 ile aynı.
create or replace function public.set_poz_price(p_company_id uuid, p_stage_id uuid, p_unit_price numeric, p_valid_from date)
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
  if not exists (select 1 from public.project_type_stages where id = p_stage_id and company_id = v_company and project_type_id is null) then
    raise exception 'Poz bulunamadı';
  end if;
  if p_unit_price is null then
    if p_valid_from is null then
      raise exception 'Silinecek fiyatın tarihi zorunlu';
    end if;
    delete from public.poz_prices where stage_id = p_stage_id and valid_from = p_valid_from;
    return;
  end if;
  if p_unit_price < 0 then
    raise exception 'Birim fiyat negatif olamaz';
  end if;
  insert into public.poz_prices (company_id, stage_id, valid_from, unit_price)
  values (v_company, p_stage_id, public.poz_default_valid_from(p_stage_id, p_valid_from), round(p_unit_price, 2))
  on conflict (stage_id, valid_from) do update
    set unit_price = excluded.unit_price, created_by = auth.uid(), created_at = now();
end;
$$;

create or replace function public.import_poz_items(p_company_id uuid, p_catalog_id uuid, p_items jsonb, p_valid_from date)
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
      perform public.set_poz_price(v_company, v_id, v_price, p_valid_from);
      v_priced := v_priced + 1;
    end if;
  end loop;

  return jsonb_build_object('count', v_index, 'priced', v_priced);
end;
$$;
