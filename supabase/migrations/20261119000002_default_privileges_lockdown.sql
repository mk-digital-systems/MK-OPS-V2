-- =============================================================================
-- MK OPS — yeni tablo ve sequence'lara otomatik yetki verilmesinin kapatılması
--
-- Supabase projelerinde postgres rolü (SQL Editor / migration'ları çalıştıran rol) için
-- public şemasında şu varsayılan yetkiler tanımlıdır (pg_default_acl):
--   tablolar   : anon, authenticated, service_role → tam yetki (arwdDxtm)
--   sequence'lar: anon, authenticated, service_role → usage / select / update
-- Yani 30 Ekim 2026'ya kadar migration ile açılan her yeni tablo, RLS unutulursa anon dahil
-- herkese açık doğar. Supabase bu varsayılanı 30 Ekim 2026'da tüm projelerde kaldıracak;
-- burada aynısı bugünden ve yalnızca bu projede uygulanır.
--
-- Bu dosya:
--   * Yalnızca postgres rolünün public şemasındaki GELECEK nesnelerini etkiler. Mevcut tablo,
--     sequence ve fonksiyon yetkilerine dokunmaz.
--   * supabase_admin ve diğer Supabase yönetim rollerinin varsayılanlarına dokunmaz.
--   * Fonksiyon varsayılanlarına dokunmaz (fonksiyonlar kendi migration'larında
--     "revoke execute ... from public, anon" ile kapatılıyor; bkz. tests/db/grants.test.mjs).
--   * 20261119000001_data_api_grants.sql'e bağlı değildir; iki sırayla da çalışır.
--     Tekrar çalıştırmak zararsızdır.
--
-- Bundan sonra her yeni tablo kendi migration'ında açıkça yetki yazmalıdır, örn.:
--   grant select, insert, update, delete on public.yeni_tablo to authenticated;
--   grant select, insert, update, delete on public.yeni_tablo to service_role;
--
-- Geri dönüş (eski davranışa dönmek istenirse, geleceğe dönük):
--   alter default privileges for role postgres in schema public
--     grant select, insert, update, delete on tables to anon, authenticated, service_role;
--   alter default privileges for role postgres in schema public
--     grant usage, select on sequences to anon, authenticated, service_role;
-- =============================================================================

begin;
set local lock_timeout = '10s';

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

-- Doğrulama: postgres'in şema bazlı (public) veya genel (şemasız) varsayılanlarında istemci rollerine
-- tablo/sequence yetkisi kalmamalı. Genel bir varsayılan varsa şema bazlı REVOKE onu silemez;
-- bu durumda migration hata verip geri alınır.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclnamespace in (0::oid, 'public'::regnamespace::oid)
    and d.defaclobjtype in ('r', 'S')
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole);
  if v_count > 0 then
    raise exception 'Varsayılan yetkiler kaldırılamadı (% kayıt)', v_count;
  end if;
end $$;

commit;
