-- =============================================================================
-- MK OPS — firma logosu (raporlarda firma adı ve logosu)
--
-- Logo dosyaları herkese açık okunan "company-logos" deposunda, firmanın kendi
-- klasöründe tutulur: <company_id>/logo-<zaman>.<uzantı>
-- Yalnızca o firmanın ana yöneticisi yükleyebilir / silebilir.
-- Firmaya bağlı logo yolu companies.logo_path alanındadır.
-- =============================================================================

-- 1. Alan --------------------------------------------------------------------------
alter table public.companies
  add column logo_path text;

alter table public.companies
  add constraint companies_logo_path_folder
  check (logo_path is null or logo_path like id::text || '/%');

-- 2. Depo ve erişim kuralları ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company_logos_insert_chief" on storage.objects;
create policy "company_logos_insert_chief"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and public.is_site_chief()
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "company_logos_update_chief" on storage.objects;
create policy "company_logos_update_chief"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.is_site_chief()
    and (storage.foldername(name))[1] = public.current_company_id()::text
  )
  with check (
    bucket_id = 'company-logos'
    and public.is_site_chief()
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "company_logos_delete_chief" on storage.objects;
create policy "company_logos_delete_chief"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.is_site_chief()
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- Yükleme sonrası üzerine yazma (upsert) için ana yönetici kendi klasörünü listeleyebilir.
-- Herkese açık depo olduğu için logo görüntülemek bu kurala bağlı değildir.
drop policy if exists "company_logos_select_chief" on storage.objects;
create policy "company_logos_select_chief"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.is_site_chief()
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- 3. Logoyu firmaya bağlama -------------------------------------------------------------
create function public.set_company_logo(p_path text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Firma logosunu yalnızca ana yönetici değiştirebilir' using errcode = '42501';
  end if;
  if v_path is not null and (
    v_path not like v_company_id::text || '/%'
    or v_path like '%..%'
    or char_length(v_path) > 200
  ) then
    raise exception 'Geçersiz logo dosyası';
  end if;
  update public.companies set logo_path = v_path where id = v_company_id;
end;
$$;

-- 4. get_my_company logo yolunu da döndürür --------------------------------------------
create or replace function public.get_my_company()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_company public.companies;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.company_id is not null then
    select * into v_company from public.companies where id = v_profile.company_id;
  end if;

  return jsonb_build_object(
    'is_super_admin', public.is_super_admin(),
    'company', case when v_company.id is null then null else jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'access_status', public.company_access_status(v_company),
      'trial_ends_at', v_company.trial_ends_at,
      'plan', v_company.plan,
      'plan_ends_at', v_company.plan_ends_at,
      'user_limit', v_company.user_limit,
      'payroll_start_day', v_company.payroll_start_day,
      'currency_code', v_company.currency_code,
      'logo_path', v_company.logo_path,
      -- Katılım kodunu yalnızca onaylı ana yönetici görür.
      'join_code', case
        when v_profile.role = 'site_chief' and v_profile.is_approved then v_company.join_code
      end
    ) end
  );
end;
$$;

-- 5. Yetkiler -----------------------------------------------------------------------------
revoke execute on function public.set_company_logo(text) from public, anon, authenticated;
grant execute on function public.set_company_logo(text) to authenticated;
