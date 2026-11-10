# MK OPS — Düzeltme Raporu

**Tarih:** 10 Kasım 2026 · **Dal:** `fix/guvenlik-asama-1` (başlangıç: `main` @ `229a532`) · **Talimat:** `GELISTIRME VE HATA AYIKLAMA.md`

Canlı veritabanı, Vercel ve harici servislerde **hiçbir değişiklik yapılmadı**. Canlıya uygulanması gerekenler `MKOPS_CANLIYA_GECIS.md` içinde.

## 0. Başlangıç ve son durum

| Kontrol | Başlangıç | Son |
|---|---|---|
| Next.js | 15.5.22 | 15.5.29 |
| `npm audit --omit=dev` | 10 uyarı (2 kritik, 6 yüksek, 2 orta) | 5 uyarı (0 kritik, 2 yüksek, 3 orta) |
| TypeScript | temiz | temiz |
| ESLint | 0 hata | 0 hata (yalnızca test dosyalarında 10 uyarı, önceden de vardı) |
| DB testleri | 27 dosya / 839 kontrol | **30 dosya / 889 kontrol** |
| Birim testleri | yok | 2 dosya / 63 kontrol |
| `next build` | bu makinede çalışmıyor (aşağıya bak) | bu makinede çalışmıyor; CI'da doğrulanacak |

**Ortam bulgusu (kanıtlı):** Yerel `next build`, dokunulmamış `HEAD` kopyasında da çöküyor (JS yığın belleği yetersiz / yerel çökme). Makinede 7,9 GB RAM'in yaklaşık 0,8 GB'ı boştu. Çökme benim değişikliklerimden bağımsız. Derleme aşaması (`Compiled successfully`) ve tip denetimi geçti; sayfa üretimi aşaması bu makinede tamamlanamadı. Bu yüzden **"production build başarılı" iddiasında bulunmuyorum**; yeni `ci.yml` bunu GitHub'da doğrulayacak.

## 1. Aşama 1 — Kritik güvenlik

### G-01 Next.js ve bağımlılıklar — TAMAMLANDI (kalan risk raporlandı)
- **Kaynak:** Next.js 15.5.22 kritik uyarıları. **Değişiklik:** `next` ve `eslint-config-next` 15.5.29'a sabitlendi; `npm audit fix` (zorlamasız) ile sharp, dompurify (jsPDF'in içinde), nanoid, source-map-js, brace-expansion güncellendi.
- **Dosyalar:** `package.json`, `package-lock.json`. **Commit:** `23e2766`.
- **Kalan 5 uyarı (kırıcı geçiş gerektirdiği için uygulanmadı):**

| Paket | Seviye | Gerçek kullanım yolu | Risk |
|---|---|---|---|
| zod 3.x | yüksek | Yalnızca tarayıcıdaki form doğrulaması (`src/lib/validations/*`); sunucuda kullanılmıyor | Saldırgan yalnızca kendi tarayıcısını yorar. Düşük |
| postcss 8.4.31 (Next içinde sabit) | yüksek | Yalnızca derleme zamanında kendi CSS'imizi işler; kullanıcı girdisi işlemez | Düşük |
| next (postcss üzerinden) | orta | Aynı | Düşük |
| exceljs → uuid | orta | Uyarı `uuid` `buf` parametresiyle çağrılmasıyla ilgili; kodumuz uuid'i doğrudan kullanmıyor | Çok düşük |

  Zod 3→4 geçişi form şemalarını etkiler; ayrı, testli bir iş olarak önerilir (acele değil).

### G-02 Login yönlendirme açığı — TAMAMLANDI
- **Kaynak:** `login-form.tsx` `redirect` parametresini doğrulamadan `router.push`'a veriyordu (doğrulandı). **Değişiklik:** merkezi `safeNextPath` (`src/lib/safe-redirect.ts`): yalnızca `/panel, /admin, /onboarding, /subscription, /pending-approval, /update-password` bölümleri; harici URL, `//`, `\`, `javascript:`, `@x`, kodlanmış (çift kodlama dahil) ve kontrol karakteri varyantları `/panel`'e düşer.
- **Test:** `tests/unit/safe-redirect.test.mjs` — 47 kontrol (40+ zararlı varyant, normal akışlar korunuyor). **Commit:** `7ee92d7`.

### G-03 Auth callback open redirect — TAMAMLANDI
- **Kaynak:** `${origin}${next}` (`next=@kotu.com` → `https://uygulama@kotu.com`). **Değişiklik:** aynı yardımcı + `new URL(next, origin)`. Geliştirme sunucusunda `next=@evil.com` ve `next=//evil.com` istekleri `/login?error=auth`'a gitti (canlı dışı, yerel denendi).
- **Şifre sıfırlama regresyonu:** `forgot-password-form` `next=/update-password` gönderiyor; bu yol izin listesinde ve testte `izinli: /update-password` kontrolü var. Akışın kodu değiştirilmedi.

### G-04 Oturum yenileme — TAMAMLANDI (gerçek hesapla doğrulanmadı)
- **Değişiklik:** `src/middleware.ts` artık `@supabase/ssr` ile `getUser()` çağırıp jetonu yeniliyor; yeni çerezler hem isteğe hem yanıta yazılıyor. `x-app-pathname` korundu. Yönlendirme **yapmıyor** (döngü riski yok). `sb-` çerezi yoksa ağ çağrısı yapmıyor. Hata olursa istek aynen devam ediyor.
- **Denendi:** geliştirme sunucusunda çerezsiz, bozuk `sb-` çerezli ve bozuk base64 çerezli `/login` istekleri 200 döndü; sayfa bozulmadı.
- **Denenemedi:** süresi dolmak üzere gerçek bir oturumda jeton yenilemenin tarayıcıda uçtan uca doğrulanması (gerçek hesap/oturum kullanılmadı; `/panel` derlemesi bu makinede bellek yüzünden tamamlanamadı). **Önizleme ortamında elle doğrulanmalı** (bkz. canlıya geçiş).

## 2. Aşama 2 — Veri bütünlüğü ve yetkilendirme

### V-01 İş planı atomik kayıt — TAMAMLANDI, canlıya uygulama ONAY BEKLİYOR
- **Kaynak (doğrulandı):** `upsertFullPlan` planı güncelleyip eski ekip/izinlileri siliyor, sonra yenilerini tek tek ekliyordu.
- **Değişiklik:** `save_work_plan(...)` RPC'si, **SECURITY INVOKER** (RLS, şube koruması, tetikleyiciler aynen geçerli, ayrıcalık yükseltmez). Tek transaction; `FOR UPDATE` kilidi; `p_expected_updated_at` ile eşzamanlı düzenleme `40001` ile reddedilir; aynı tarih/şube için plan id verilmese de mevcut plan güncellenir.
- **Migration:** `20261120000003_save_work_plan_rpc.sql`. **Dosyalar:** `work-plan-repository.ts`, `work-plan-editor.tsx`, `[id]/edit/page.tsx`.
- **Test:** `tests/db/save-work-plan.test.mjs` — 26 kontrol: kısıt ihlali ekip/üye/izinli aşamalarında hata verince plan bire bir aynı kalıyor; 6 doğrulama hatası; yetki (izinsiz şantiye şefi, muhasebe, başka firma, anon); SECURITY INVOKER.
- **Kalan risk:** Gerçek eşzamanlı iki bağlantı testi PGlite'ta (tek bağlantı) yapılamadı; `FOR UPDATE` ve `expected_updated_at` mantığı kodla/sıralı testle doğrulandı, gerçek yarış koşulu canlıda gözlenmeli. **Dağıtım sırası kritik: önce migration, sonra uygulama** (aksi halde plan kaydı hata verir).

### V-02 Proje Excel dışa aktarımı — TAMAMLANDI
- **Kaynak (doğrulandı):** `pageSize: 5000` tek istek; Supabase satır sınırı yüzünden 1.001+ kayıtta sessiz eksiklik. Ayrıca sayfa her açılışta 5.000 satır çekiyordu.
- **Değişiklik:** `fetchAllPages` (`src/lib/paginate.ts`): sunucunun gerçekte döndürdüğü satıra göre ilerler, `id` ile kararlı sıralama, tekrar ayıklama, 20.000 üst sınır. Dışa aktarım **tıklanınca** çalışır; "N proje aktarıldı" bildirilir, eksikse "X / Y aktarıldı" uyarısı çıkar.
- **Test:** `tests/unit/paginate.test.mjs` — 16 kontrol (0, 999, 1.000, 1.001, 5.000, 5.001, 12.000 kayıt; sunucu sınırı 500 ve 100; eski yöntemin 1.000'de kaldığının kanıtı).
- **Sınır:** Excel dosyasını gerçek veriyle indirme (UI) tarayıcıda denenmedi.

### V-03 Taslak düzenleme yetkisi — TAMAMLANDI
- `requireModuleWrite("work_plans", …)` sayfa düzeyinde; layout'taki yazma-rotası desenine taslak yolu eklendi. DB tarafı için `tests/db/work-plan-drafts.test.mjs` — 16 kontrol (izinsiz rol, başka firma, izin aç/kapa). Not: yeni şantiye şefine `hakediş` dışındaki modüller **tasarım gereği varsayılan açık**.

### V-04 `personnel_branch_on` / `vehicle_branch_on` — TAMAMLANDI, canlıya uygulama ONAY BEKLİYOR
- **Doğrulandı:** eski fonksiyonla B firması, A firmasının personelinin şube UUID'sini alabiliyordu. **Migration:** `20261120000002_branch_helpers_company_guard.sql` (firma dışı kayıt → `NULL`; `auth.uid()` boşsa güvenilir bağlam etkilenmez). **Test:** `branch-helpers-guard.test.mjs` — 8 kontrol. Gerçek etki düşüktü (yalnızca bir UUID dönüyordu).

### V-05 Sayfa ve rol kontrolleri — TAMAMLANDI
- Ayarlar, kullanıcılar, işlem geçmişi, proje türleri, destek, hakediş, taşeron sayfalarında sayfa düzeyi kontrol **zaten vardı**. Eksik olanlara eklendi: `work-plans` (yeni/düzenle/taslak), `projects` (yeni/düzenle), `approvals` (`requireCanApprove`). Veri koruması RLS'te sürüyor.

## 3. Aşama 3 — Güvenilirlik

| Kod | Durum | Not |
|---|---|---|
| R-01 Güvenlik başlıkları | **Kısmen** | HSTS, nosniff, X-Frame-Options, `frame-ancestors`, Referrer-Policy, Permissions-Policy, `poweredByHeader:false` yayında. **CSP yalnızca Report-Only**; zorunlu hale getirmek için canlıda bir süre izlenmeli |
| R-02 Hata ekranları | **Kısmen** | `error.tsx`, `global-error.tsx` (Türkçe, tekrar dene, hata kodu/digest). **Sentry kurulmadı** (harici hesap/ücret: onay gerekir) |
| R-03 CI | **Tamamlandı (çalıştırılmadı)** | `.github/workflows/ci.yml`: typecheck, eslint, birim test, build, audit(kritik). DB testleri mevcut `db-tests.yml`'de. `.vercel` lint dışında. GitHub'da henüz koşmadı |
| R-04 Ön yüz/E2E testleri | **Yapılmadı** | Tarayıcı/E2E altyapısı yok; bu makinede `next build` bile çalışmıyor. Birim ve DB düzeyinde testler eklendi |
| R-05 Süper admin güvenliği | **İncelendi, uygulanmadı** | Aşağıya bak |
| R-06 Yedekleme | **Belgelenmedi — doğrulanamadı** | Supabase planı/yedek ayarlarına erişimim yok |
| R-07 Auth panel ayarları | **Doğrulanamadı** | Panele erişimim yok; kontrol listesi `MKOPS_CANLIYA_GECIS.md`'de |

**R-05 notları:** Süper admin işlemleri artık `platform_events` (silinse de kalan, değiştirilemez) kaydına yazılıyor (önceki işte yapıldı, canlıda). MFA/AAL2 zorunluluğu **etkinleştirilmedi** (talimat: yönetici onayı ve kurtarma prosedürü olmadan açılmaz). Öneri: önce süper admin hesabı için Supabase panelinden MFA kaydı, sonra `assert_super_admin()` içinde `auth.jwt()->>'aal' = 'aal2'` kontrolü; kilitlenmeye karşı ikinci bir süper admin hesabı ve kurtarma adımı belgelenmeli. Şirket silme zaten adı yazarak onay istiyor.

## 4. Aşama 4 — Kullanıcı deneyimi (YAPILMADI; talimat güvenlik bitmeden başlamamayı söylüyor)

Envanter ve durum:
- **U-04:** `window.confirm` 18 dosyada, 30 yerde. Tutarlı bir onay penceresi bileşeni yazılıp kademeli taşınmalı.
- **U-01:** `public/` altında manifest yok; ikon yalnızca `logo-mk-ops.png`. Offline önbellek yok (hassas veri riski nedeniyle önce salt-okunur tasarım).
- **U-02, U-03, U-05, U-06, U-07, U-08, U-09, U-10:** başlanmadı. U-06/U-07 yeni tablo/e-posta gerektirebilir → onay. U-08/U-09 ticari karar ve gerçek bilgi gerektirir (limit/fiyat/KDV/deneme süresi/yasal bilgiler **uydurulmadı, değiştirilmedi**).

## 5. Değişen dosyalar, commit'ler

`23e2766` deps · `7ee92d7` redirect · `cb306bb` middleware · `d23daf0` başlıklar+hata ekranları · `3df4aa8` sayfa yetkileri · `747cdbe` V-04 · `8d945ea` V-02 · `97a9d1d` V-01 · `4fdcd4c` CI/CSP.
