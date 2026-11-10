-- =============================================================================
-- MK OPS — süper admin için iki adımlı doğrulama (MFA / AAL2) zorunluluğu
--
-- Kural: doğrulanmış (verified) bir MFA faktörü olan platform yöneticisi, oturumu aal2 değilse
-- SÜPER ADMİN SAYILMAZ. Yani parolası ele geçirilse bile API'den (anon anahtarı + parola) admin
-- fonksiyonları ve süper admin RLS yolları çalışmaz.
--
-- * Faktörü OLMAYAN yönetici etkilenmez (geçiş güvenli: önce panelden Güvenlik → doğrulayıcı ekle).
-- * Kilitlenme durumunda kurtarma: docs/dahili/yonetici-mfa-kurtarma.md
--   (SQL Editor: delete from auth.mfa_factors where user_id = '<id>';)
-- * is_super_admin() aynı imzayla yeniden tanımlanır (yetkileri korunur); assert_super_admin() yalnızca
--   MFA eksikse farklı ve açıklayıcı bir hata verir.
-- =============================================================================
begin;

-- Fonksiyonun çalışma anında auth.mfa_factors'u okuyabilmesi şart: okunamıyorsa migration başarısız olur.
do $$
begin
  perform 1 from auth.mfa_factors limit 1;
exception when others then
  raise exception 'auth.mfa_factors okunamıyor (%): MFA zorunluluğu uygulanamaz, migration iptal', sqlerrm;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then false
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
    else not exists (
      select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
    )
  end;
$$;

create or replace function public.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    if exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then
      raise exception 'İki adımlı doğrulama gerekli: çıkış yapıp tekrar giriş yapın ve doğrulama kodunu girin'
        using errcode = '42501', hint = 'mfa_required';
    end if;
    raise exception 'Bu işlem için süper admin yetkisi gerekli' using errcode = '42501';
  end if;
end;
$$;

commit;
