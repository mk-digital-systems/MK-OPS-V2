# MK OPS — Canlıya Geçiş Planı

**Hiçbiri henüz uygulanmadı.** Her adım yöneticinin onayını ve elle uygulanmasını bekliyor. Dal: `fix/guvenlik-asama-1` (`main`'e birleştirilmedi).

## Sıra (önemli)
1. **Migration'lar** (Supabase SQL Editor, bu sırayla; her biri kendi `begin; … commit;` içinde; yeniden çalıştırılmaz)
2. **Anon probe ve doğrulama sorguları**
3. **Önizleme (preview) dağıtımı ve elle doğrulama**
4. **`main`'e birleştirme → Vercel üretim dağıtımı**

> Neden bu sıra: yeni uygulama kodu `save_work_plan` fonksiyonunu çağırıyor. Fonksiyon yokken dağıtım yapılırsa **iş planı kaydetme hata verir**. Migration'ları önce uygulamak eski kodu bozmaz (yeni fonksiyon eklenir, iki yardımcı fonksiyon sıkılaşır).

## 1. Migration'lar

| Dosya | Ne yapar | Eski uygulamayı bozar mı |
|---|---|---|
| `20261120000002_branch_helpers_company_guard.sql` | `personnel_branch_on` / `vehicle_branch_on` başka firmanın kaydı için `NULL` döner | Hayır (aynı imza ve yetki) |
| `20261120000003_save_work_plan_rpc.sql` | `save_work_plan` RPC (SECURITY INVOKER) | Hayır (yeni fonksiyon) |

| `20261121000001_official_holidays.sql` | Resmi tatiller (RT) + pazar/tatilde İzinli: yeni `official_holidays` tablosu, `is_rest_day` yardımcıları, süper admin RPC'leri ve 7 mevcut puantaj/bordro fonksiyonunun güncellenmesi | **Evet, dikkat:** bordro/ekstre fonksiyonlarını değiştirir. Tatil kuralı yalnızca **11 Kasım 2026'dan itibaren** geçerli; önceki dönemlerin hesabı değişmez. Uygulama kodu bu migration'dan önce de çalışır (tatil listesi boş döner), ama **önce migration** önerilir |

(`20261120000001_admin_overview.sql` süper admin paneli için zaten uygulandı.)

**Resmi tatil sonrası kontrol (migration 20261121000001):**
```sql
-- 7 fonksiyonda artık sabit 'pazar mı?' kontrolü kalmamalı (boş dönmeli)
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('ensure_current_sunday_attendance','ensure_sunday_attendance_for_month','get_attendance_month_archives',
    'get_monthly_payroll','get_personnel_attendance_detail','subcontractor_salary_rows','validate_attendance_date_and_weekly_rest')
  and pg_get_functiondef(oid) ~* 'isodow[^)]*\)\s*(=|<>)\s*7';
-- anon probe: /rest/v1/official_holidays -> 42501
```
Sonra süper admin → **Resmi Tatiller** sayfasından 2027 Ramazan ve Kurban Bayramı tarihlerini ekleyin (Diyanet takvimine göre).

Her biri için sonrasında:
```sql
-- anon çalıştıramamalı (boş dönmeli)
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
  and has_function_privilege('anon', p.oid, 'execute');
-- save_work_plan SECURITY INVOKER olmalı (prosecdef = false)
select prosecdef from pg_proc where proname = 'save_work_plan';
```
Anon probe: `POST /rest/v1/rpc/save_work_plan` anon anahtarıyla → `42501` beklenir.

## 2. Önizleme ortamında elle doğrulama (gerçek müşteri verisi kullanmadan, test firması ile)
- [ ] Giriş yap → `/login?redirect=/panel/projects` ile giriş sonrası projelere gider; `?redirect=https://example.com` ve `?redirect=//example.com` ile `/panel`'e gider.
- [ ] **Şifre sıfırlama:** e-posta bağlantısı → şifre güncelleme sayfası → yeni şifreyle giriş (mevcut çalışan akış bozulmamış olmalı).
- [ ] Oturum yenileme: giriş yapıp uzun süre (jeton süresi kadar) açık bıraktıktan sonra sayfa gezintisi hâlâ oturumlu.
- [ ] İş planı: yeni plan, düzenleme, aynı tarihe ikinci kayıt, iki sekmede aynı planı düzenleyip ikincisinde "başka biri tarafından değiştirildi" mesajı.
- [ ] Projeler → Excel: kayıt sayısı bildirimi; 1.000+ proje varsa dosyadaki satır sayısı = listedeki "N proje".
- [ ] İzinsiz kullanıcı (iş planı izni kapalı şantiye şefi) `/panel/work-plans/new` ve taslak düzenleme adreslerine girince listeye döner.
- [ ] Tarayıcı konsolunda **CSP Report-Only** ihlal listesi: ihlal çıkan alanlar (ör. GA, harita, görsel) not edilip politika düzeltilmeli; temizse `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

## 3. Supabase panel kontrol listesi (doğrulanamadı — elle bakılmalı)
- [ ] Auth → URL Configuration: Site URL ve **Redirect URLs** yalnızca üretim/önizleme adresleri (şifre sıfırlama `…/auth/callback` dahil).
- [ ] Auth → Attack Protection: CAPTCHA (Turnstile/hCaptcha) açık mı; giriş/kayıt/şifre sıfırlama **oran sınırları**.
- [ ] Auth → Providers → Email: e-posta doğrulaması (confirm email) açık mı; parola uzunluğu/karmaşıklık.
- [ ] Oturum: JWT süresi, refresh token rotasyonu, "single session" ihtiyacı.
- [ ] Database → Backups: plan, günlük yedek, PITR var mı; **bir geri yükleme denemesi** (ayrı proje) yapıldı mı.
- [ ] Edge Function `delete-user`: `verify_jwt = true` (config.toml'da var). Mesajlar kodda "firma yöneticisi" olarak düzeltildi; **yeniden deploy edilmeli** (`supabase functions deploy delete-user`, ayrı onay).
- [ ] Süper admin hesabı için MFA (TOTP) kaydı; ikinci süper admin ve kurtarma adımı belgesi → sonra AAL2 zorunluluğu (ayrı onay).

## 3a. Cloudflare Turnstile (CAPTCHA) — kod hazır, SIRA ÖNEMLİ
Kod `NEXT_PUBLIC_TURNSTILE_SITE_KEY` yoksa CAPTCHA kutusunu göstermez ve Auth çağrılarına token eklemez (mevcut giriş aynen çalışır).

1. **Vercel → Project → Settings → Environment Variables:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Cloudflare **Site Key** (herkese açık anahtar). Production (ve istersen Preview) için ekle.
   - Cloudflare widget'ının **Hostname** listesinde üretim alan adı (ve önizleme kullanacaksan `*.vercel.app` önizleme adresi) bulunmalı; yoksa widget hata verir (kod bu durumda kullanıcıyı kilitlemez, uyarı gösterir).
2. Kodu yayınla (onay sonrası) ve `/login`, `/register`, `/forgot-password` sayfalarında kutunun göründüğünü, düğmenin doğrulamadan sonra açıldığını doğrula. **Supabase CAPTCHA hâlâ kapalıyken** üç akış çalışmalı (token Supabase'e gider, kapalıyken yok sayılır).
3. **Ancak sonra** Supabase → Authentication → Attack Protection → CAPTCHA: sağlayıcı *Turnstile*, **Secret Key**'i yalnızca bu panele gir. (Secret Key Vercel'e, repoya veya `NEXT_PUBLIC_*` değişkenine yazılmaz.)
4. Önizleme/üretimde dene: giriş, kayıt, şifre sıfırlama isteği, e-postadaki bağlantıyla yeni şifre belirleme (bu son adım CAPTCHA kullanmaz).
5. Sorun olursa anında geri dönüş: Supabase'de CAPTCHA'yı kapat (kod zararsız kalır).
6. Sonra CSP'yi Report-Only'den zorunluya alırken `https://challenges.cloudflare.com` script/frame/connect'te zaten ekli.

**Sıra ters yapılırsa** (önce Supabase'de aç, sonra kod) kimse giriş yapamaz.

## 4. Vercel
- [ ] Ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (üretim ve önizleme). **Service role anahtarı Vercel'de olmamalı.**
- [ ] İlk önizleme dağıtımında build başarılı mı (bu makinede yerel build çalışmıyor; CI ve Vercel build'i gerçek doğrulama).
- [ ] Yanıt başlıkları: `curl -I https://…/login` → HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CSP, `X-Powered-By` yok.

## 5. Geri dönüş
- Kod: `main`'e birleştirmeden önce önceki commit `229a532`; Vercel'de önceki dağıtıma "Promote".
- `save_work_plan`: kod eski sürüme dönerse fonksiyon kullanılmaz kalır (zararsız). İstenirse `drop function public.save_work_plan(uuid, date, uuid, text, jsonb, jsonb, timestamptz);` ile yeni bir migration'da kaldırılır.
- Yardımcı fonksiyonlar: eski tanım `20261027000001_branch_history.sql`'de; geri almak yeni migration ile.
