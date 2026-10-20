# SUPABASE_SECURITY.md — MK OPS veritabanı güvenlik kuralları

Bu belge, MK OPS üzerinde yapılacak **her** geliştirmede (yeni modül, tablo, sequence, RPC, hata düzeltme, migration)
geçerli kalıcı teknik referanstır. Veritabanına dokunan her çalışmadan önce okunur; kontrol listesi (bölüm 12) atlanmaz.

## 1. Neden var, mevcut durum

- Supabase, **30 Ekim 2026'dan** itibaren `public` şemasında yeni oluşturulan tablolara `anon`, `authenticated` ve
  `service_role` için otomatik Data API yetkisi vermiyor. Yeni tablo, açık `GRANT` yazılmadıkça API'den
  `42501 permission denied` verir. Mevcut tabloların yetkileri korunur.
- Eskiden bu otomatik yetki **anon dahil tam yetkiydi**; güvenlik yalnızca RLS'e bağlıydı. Önceki migration'lar
  "otomatik yetki var" varsayıp yalnızca fazlasını geri alıyordu; sıfırdan kurulumda (yeni proje, `db reset`)
  sonradan eklenen tablolar yetkisiz kalıyordu.
- Çözüm iki migration'dır ve **canlı ortamda uygulanmıştır (SQL Editor, doğrulandı)**. Yeniden çalıştırılmamalıdır:
  - `20261119000001_data_api_grants.sql` — 78 tablonun yetkisini açıkça ve en az yetkiyle yazar, 4 sequence'ı düzenler,
    kendi doğrulama bloğuyla kontrol eder.
  - `20261119000002_default_privileges_lockdown.sql` — `postgres` rolünün `public` şemasındaki tablo ve sequence
    **varsayılan yetkilerini** kaldırır. Artık yeni tablo hiçbir istemci rolüne yetkisiz doğar.
- Uygulanmış bir migration dosyası **asla düzenlenmez**; değişiklik her zaman yeni bir migration dosyasıyla yapılır.
  Migration'lar canlıda SQL Editor'den elle çalıştırılır.

## 2. Roller

| Rol | Kim | Kural |
|---|---|---|
| `anon` | Oturumsuz ziyaretçi (anon key) | **Hiçbir tabloda, sequence'ta, fonksiyonda yetkisi yoktur.** Uygulama oturumsuz tablo sorgusu yapmaz. |
| `authenticated` | Giriş yapmış kullanıcı | Yalnızca **gerekli** SELECT/INSERT/UPDATE/DELETE. Satır erişimini RLS belirler. |
| `service_role` | Sunucu/edge function (RLS'i aşar) | Kullanım ihtiyacına göre açık yetki. Anahtarı **asla** istemciye/`NEXT_PUBLIC_*` değişkenine konmaz. Şu an yalnızca `delete-user` edge function'ı kullanır. |
| `postgres` | Migration'ları çalıştıran rol | Nesnelerin sahibi. Varsayılan yetkileri 002 ile kapatıldı. |
| `supabase_admin` ve diğer yönetim rolleri | Supabase | **Müdahale edilmez.** Bizim nesnelerimizi `postgres` oluşturur. |
| `PUBLIC` | Herkes (sözde rol) | Tablo/sequence üzerinde **hiçbir zaman** yetki verilmez. Fonksiyonlarda varsayılan olarak EXECUTE alır; bkz. bölüm 7. |

## 3. Temel kurallar

1. **Yeni her `public` tablosunun yetkisi, kendi migration'ında açıkça yazılır.** Varsayılan yetki yoktur; yazılmazsa tablo
   API'den görünmez (bu güvenli yöndür, ama uygulama bozulur — test yakalar).
2. **En az yetki:** `authenticated` yalnızca RLS politikasının izin verdiği işlemler için yetki alır. Politikası olmayan
   işleme yetki verilmez. `TRUNCATE`, `TRIGGER`, `REFERENCES` (ve PG17'de `MAINTAIN`) hiçbir istemci rolüne verilmez;
   `TRUNCATE` RLS'ye takılmaz, tüm firmaların verisini siler.
3. **`anon` kapalı kalır.** Bir tabloyu anon'a açmak mimari karardır; bu belge güncellenmeden, testteki beklenti
   değiştirilmeden yapılmaz.
4. **RLS her tabloda açık olur** (`enable row level security`) ve firma/şube erişim politikaları korunur (bölüm 5).
   `GRANT` kapıyı açar, RLS satırı süzer; ikisi birlikte düşünülür. RLS politikası değiştirmek ayrı, bilinçli bir iştir.
5. **`service_role`** için yetki ihtiyaca göre açık yazılır. Yeni tabloda edge function'ın işi yoksa verilmez.
6. **Yalnızca RPC ile erişilen tablolar istemciye açılmaz** (bölüm 6).
7. Uygulanmış migration dosyaları düzenlenmez; yeni migration yazılır, `begin; … commit;` içine alınır.

## 4. Mevcut yetki modeli (78 tablo, 4 sequence)

Gerçek kaynak: `supabase/migrations/20261119000001_data_api_grants.sql` ve testteki `expectedAuth` listesi
(`tests/db/grants.test.mjs`). Özet:

- **Kapalı (yalnızca RPC), 11 tablo:** `attendance_month_approvals`, `company_join_attempts`, `company_vault_attempts`,
  `company_vault_notes`, `company_vault_sessions`, `company_vaults`, `head_office_grants`, `notification_reads`,
  `platform_admins`, `user_branches`, `vehicle_assignment_history`.
- **Yalnızca SELECT, 39 tablo:** yazma RPC ile yapılır (örn. `companies`, `profiles`, `catalogs`, `poz_prices`,
  `production_*`, `inventory_*`, `audit_logs`, `hakedis_log_values`).
- **Doğrudan yazma, 28 tablo:** örn. `personnel`, `projects`, `project_types`, `subcontractors`, `teams`,
  `private_notes` (CRUD); `vehicles`, `app_settings`, `attendance_month_notes` (SELECT/INSERT/UPDATE);
  `personnel_employment_periods` (SELECT/INSERT); `shared_notes` (SELECT/DELETE).
- **`service_role`:** bütün tablolarda SELECT/INSERT/UPDATE/DELETE.
- **`anon`:** hiçbir şeyde yetki yok.

## 5. RLS ve çok kiracılı (firma/şube) yapı

Her firma verisi tablosu şu kalıbı izler (örnekler: `subcontractor_period_closures`, `project_sheet_kesif`):

- `company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade`
- `alter table … enable row level security;`
- **Kısıtlayıcı (restrictive) firma izolasyonu**, `authenticated` için, `FOR ALL`:
  `company_id = (select public.current_company_id())` (hem `using` hem `with check`).
- Şubeye bağlı kayıtlarda ayrıca `branch_isolation` politikası ve şube yardımcı fonksiyonları.
- İzin verici (permissive) politikalar rol/modül yetkisini belirler (`has_module_write_permission(...)`,
  `can_view_personnel_attendance()` vb.).
- Politikalar `TO authenticated` olur; `anon`'a politika yazılmaz.
- `USING (true)` ancak açık gerekçeyle (örn. katalog okuma) ve **mutlaka** firma izolasyonu restrictive politikasının
  arkasında kullanılır.
- Maaş, avans, hakediş fiyatı, kasa (vault), müşteri/firma gizli verileri için en dar politika yazılır; bu tablolar
  gerekiyorsa RPC-only olur.

## 6. RPC-only (istemciye kapalı) tablolar

Bir tablo yalnızca `SECURITY DEFINER` fonksiyonlarla okunup yazılacaksa:

- `authenticated`'a **hiçbir** tablo yetkisi verilmez (SELECT bile).
- `grants.test.mjs` içindeki `rpcOnly` kümesine ve `expectedAuth` içine `""` olarak eklenir.
- İstemci `.from("tablo")` ile erişmeye çalışmamalıdır (test bunu yakalar).
- Bu tablolara yetki vermek yerine fonksiyon eklenir/genişletilir.

## 7. Fonksiyonlar (RPC) — SECURITY DEFINER, EXECUTE, search_path

PostgreSQL'de yeni fonksiyon varsayılan olarak **PUBLIC'e (dolayısıyla anon'a) EXECUTE verir**. Bu yüzden her fonksiyon
kendi migration'ında şu kalıpla yazılır:

```sql
create function public.ornek_islem(p_id uuid)
returns uuid
language plpgsql
security definer            -- yalnızca gerekiyorsa; yetki kontrolü fonksiyonun içinde yapılır
set search_path = public    -- ZORUNLU (SECURITY DEFINER'da şema kaçırma saldırısını önler)
set row_security = off      -- yalnızca iş mantığı RLS'i bilerek aşıyorsa
as $$
begin
  if public.current_company_id() is null or not public.has_module_write_permission('modul') then
    raise exception 'Yetki gerekli' using errcode = '42501';
  end if;
  -- … firma/şube kontrolleri açıkça yazılır; p_company_id gibi parametreler istemciden GÜVENİLMEZ
end;
$$;

revoke all on function public.ornek_islem(uuid) from public, anon;
grant execute on function public.ornek_islem(uuid) to authenticated;
```

- `anon` ve `PUBLIC` hiçbir `public` fonksiyonunu çalıştıramaz (test: "anon hiçbir public fonksiyonu çalıştıramıyor").
- Yalnızca **uygulamanın çağırdığı** fonksiyonlara `authenticated` EXECUTE verilir. Trigger fonksiyonlarına ve iç
  yardımcılara verilmez (trigger çalışması için çağıranın EXECUTE'u gerekmez).
- Firma kimliği daima `public.current_company_id()` ile sunucuda belirlenir.
- `SECURITY DEFINER` fonksiyonu içinde dinamik SQL varsa `format('%I', …)` / `quote_*` kullanılır.
- Fonksiyon imzası değişirse (`create or replace` ile parametre eklemek eski imzayı silmez) eski imza `drop function` ile
  kaldırılır ve yetkileri yeni imzada tekrar yazılır.

## 8. Sequence ve identity sütunları

- Mevcut 4 sequence (`attendance_audit_logs_id_seq`, `audit_logs_id_seq`, `company_join_attempts_id_seq`,
  `company_vault_attempts_id_seq`) **identity** sütunlarına aittir. Identity sütununa insert, çağıranın sequence yetkisini
  istemez; bu yüzden istemci rollerine sequence yetkisi verilmez. (Yalnızca baseline'dan kalan
  `attendance_audit_logs_id_seq` için authenticated/service_role `USAGE` korunur.)
- `serial` veya `default nextval('…')` kullanılırsa çağıranın sequence `USAGE` yetkisi gerekir; **tercih edilen yol
  identity (`generated always as identity`) veya `uuid` (`gen_random_uuid()`)** kullanmaktır.
- Sequence'a yetki verilecekse yalnızca `USAGE` ve yalnızca gerçekten ihtiyacı olan role verilir; anon'a asla.
- Her sequence kararı kontrol listesine ve `grants.test.mjs` içindeki sequence beklentisine yansıtılır.

## 9. View, materialized view, foreign table

- `public` şemasında **view, materialized view ve foreign table oluşturulmaz**: sahibi (postgres) ile çalışıp RLS'i
  aşarlar ve Data API'ye sızabilirler. Gerekiyorsa `SECURITY DEFINER` fonksiyonu (RPC) kullanılır.
- Zorunluysa: `create view … with (security_invoker = true)`, anon'a yetki yok, ayrı bir güvenlik incelemesiyle ve bu
  belge + testler güncellenerek.
- 001 migration'ı bunlar varken bilerek durur (`revoke all on all tables` onların yetkisini de sıfırlar).

## 10. Varsayılan yetkiler (`pg_default_acl`)

- `postgres` rolü için `public` şemasında tablo/sequence varsayılanları kaldırıldı (002). **Bunları geri açan
  `alter default privileges … grant …` yazılmaz.** Her tablo/sequence kendi migration'ında açık yetki alır.
- Fonksiyon varsayılanları bilerek bırakıldı; fonksiyonlar bölüm 7'deki `revoke … from public, anon` ile kapatılır.
- `supabase_admin` ve diğer Supabase rollerinin varsayılanlarına dokunulmaz.
- Test düzeneğindeki `tests/db/supabase-stubs.sql` bilerek **otomatik yetki vermez**. Oraya "default privileges grant all"
  geri eklenmez; aksi halde eksik GRANT hataları testlerden gizlenir.

## 11. Yeni tablo — örnek migration

```sql
begin;

create table public.ornek_kayit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  ad text not null,
  created_at timestamptz not null default now()
);
create index idx_ornek_kayit_company on public.ornek_kayit (company_id);
comment on table public.ornek_kayit is '…';

-- 1) RLS
alter table public.ornek_kayit enable row level security;

create policy "company_isolation" on public.ornek_kayit
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "ornek_kayit_select" on public.ornek_kayit for select to authenticated
  using ((select public.has_module_write_permission('modul')));
-- yazma politikaları yalnızca istemci doğrudan yazacaksa

-- 2) Yetkiler — yalnızca politikaların izin verdiği işlemler; anon için hiçbir şey yazılmaz
grant select on public.ornek_kayit to authenticated;          -- + insert/update/delete gerekiyorsa
grant select, insert, update, delete on public.ornek_kayit to service_role;  -- yalnızca edge function kullanacaksa

commit;
```

Ardından `tests/db/grants.test.mjs` içindeki `expectedAuth` listesine tabloyu ekle (`S`, `SIU`, `""` …).
Yalnızca RPC ile erişilecekse yetki satırlarını yazma, `rpcOnly`'ye ekle.

## 12. Her migration için kontrol listesi

- [ ] Uygulanmış hiçbir migration düzenlenmedi; yeni dosya, sıradaki zaman damgası, `begin; … commit;`.
- [ ] Yeni tablo: `enable row level security`, `company_isolation` (restrictive) + gerekli permissive politikalar, `TO authenticated`.
- [ ] Yeni tablo: `GRANT` açıkça yazıldı; yalnızca politikanın izin verdiği işlemler; `anon`'a, `PUBLIC`'e, `TRUNCATE/TRIGGER/REFERENCES`'e yetki yok.
- [ ] `service_role` yalnızca ihtiyaç varsa.
- [ ] RPC-only tablo istemciye açılmadı; `rpcOnly` ve `expectedAuth` güncellendi.
- [ ] Yeni fonksiyon: `set search_path = public`, içeride yetki/firma kontrolü, `revoke all … from public, anon`, `grant execute … to authenticated` (yalnızca uygulamanın çağırdığı).
- [ ] Fonksiyon imzası değiştiyse eski imza silindi, yetkiler yeni imzada yazıldı.
- [ ] Sequence/identity kararı verildi (tercihen identity/uuid); anon'a yetki yok.
- [ ] `public`'te view/materialized view/foreign table oluşturulmadı.
- [ ] `varsayılan yetki` (`alter default privileges`) ile genişleme yapılmadı.
- [ ] `tests/db/grants.test.mjs` güncellendi; `npm run test:db` yeşil.
- [ ] İstemci kodu: yeni `.from("tablo")`/`.rpc("ad")` çağrıları sabit adlı (test bunları tarar).
- [ ] Canlıda uygulamadan sonra: anon probe (`/rest/v1/<tablo>` → `42501`), ilgili ekranın duman testi.

## 13. Testler

`npm run test:db` (CI: `.github/workflows/db-tests.yml`, push'ta çalışır) tüm migration'ları PGlite'ta, **otomatik yetkisiz**
sıfırdan kurar. `tests/db/grants.test.mjs` şunları doğrular:

- Her tabloda RLS açık; anon hiçbir tablo/sequence/fonksiyonda yetkili değil; ACL'de PUBLIC kaydı yok.
- TRUNCATE/TRIGGER/REFERENCES/MAINTAIN istemci rollerinde yok.
- 78 tablo × anon/authenticated/service_role beklenen yetki matrisi (`expectedAuth`); 4 sequence beklentisi.
- Gerçek rollerle her tabloya sorgu: anon yetki hatası alır, RPC-only tablolar authenticated'a kapalı.
- Uygulamadaki her `.rpc("ad")` veritabanında var ve `authenticated` çalıştırabiliyor; her `.from("tablo")` var ve gereken
  yetki (SELECT + kodda görülen yazma) verilmiş.
- Yeni oluşturulan tablo/sequence otomatik yetki almıyor; varsayılan yetki kayıtları yalnızca fonksiyon satırı.
- 001'in doğrulama bloğu 82 nesnede bozulmayı yakalıyor; eski varsayılanlı veritabanından yükseltme = sıfırdan kurulum.

**Sınırlar:** PGlite gerçek Supabase (PostgREST, `supabase_admin`) değildir; ilişkili sorgularla (embedded select) gelen
tablo ihtiyaçları ve `src/` dışındaki kod (edge function) otomatik taranmaz — bunlar elle kontrol edilir.

## 14. Canlıda doğrulama (salt okunur sorgu örnekleri)

```sql
-- Tablo yetkileri: anon boş olmalı; TRUNCATE/TRIGGER/REFERENCES hiçbir istemci rolünde olmamalı
select c.relname, has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'truncate') as auth_truncate
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'truncate'));

-- Varsayılan yetkiler: postgres/public için tablo (r) ve sequence (S) satırı olmamalı
select defaclrole::regrole, defaclobjtype::text, defaclacl from pg_default_acl;

-- anon'un çalıştırabildiği public fonksiyon (boş olmalı)
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
  and has_function_privilege('anon', p.oid, 'execute');
```

Geri dönüş gerekirse yalnızca ilgili tablo için `grant …` verilir; toplu geri dönüşte migration öncesi alınan yetki
dökümüne göre geri yükleme yapılır. RLS politikaları veri sınırını bu sırada da korur.

## 15. Diğer güvenlik notları

- Service role anahtarı yalnızca sunucu/edge function ortam değişkenindedir; repoya, `.env.example`'a, istemci koduna
  girmez. `.env*` dosyaları git'e eklenmez.
- Edge function'lar (`supabase/functions/*`) çağıranı doğrular (`getUser`) ve rolünü/yetkisini kontrol ettikten sonra
  service role kullanır.
- Storage: bucket'lar varsayılan olarak `public = false`; politikalar firma klasörüne göre yazılır
  (`company-logos` bilinçli olarak herkese açık logo içindir).
- Hassas veriler (TC kimlik, maaş, avans, hakediş birim fiyatı, kasa) için en dar rol/modül politikası yazılır;
  loglara/hata mesajlarına yazılmaz.
