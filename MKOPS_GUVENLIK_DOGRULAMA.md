# MK OPS — Güvenlik Doğrulama (önceki / sonraki durum)

Her satır bir bulgu: **önceki durum**, **sonraki durum**, **kanıt**. "Kanıtlı" = bu oturumda çalıştırılan test/komut; "doğrulanamadı" = erişim yok.

| Kod | Önceki | Sonraki | Kanıt |
|---|---|---|---|
| G-01 Next.js | 15.5.22, kritik RCE uyarıları | 15.5.29; kritik uyarı 0 | `npm audit --omit=dev` → 0 kritik (CI'da `--audit-level=critical` kapısı) |
| G-01 diğer | dompurify (kritik), sharp, nanoid, brace-expansion, source-map-js | güncel | audit çıktısı; kalan 5 uyarı gerekçeli (bkz. düzeltme raporu §1) |
| G-02 Login redirect | `redirect=` doğrulanmıyordu | izin listesi + normalize | `safe-redirect.test.mjs` 47/47 |
| G-03 Callback redirect | `${origin}${next}` (`@evil.com` ile dış adres) | `new URL(safeNext, origin)` | birim test + yerel sunucu: `next=@evil.com`, `//evil.com` → `/login?error=auth` |
| G-04 Oturum yenileme | middleware yalnızca başlık ekliyordu | `getUser()` ile yenileme, çerez aktarımı | yerel: çerezsiz/bozuk çerezli istek 200. **Gerçek oturumla uçtan uca: doğrulanamadı** |
| V-01 İş planı | yarım kayıt/veri kaybı riski | tek transaction RPC | `save-work-plan.test.mjs` 26/26 (hata enjeksiyonu → plan bire bir aynı) |
| V-02 Excel | 1.000 satırda sessiz kesilme | sayfalı, sayı bildirimi | `paginate.test.mjs` 16/16 |
| V-03 Taslak | yalnızca layout (taslak yolu kapsam dışı) | sayfa + RLS testi | `work-plan-drafts.test.mjs` 16/16 |
| V-04 Şube yardımcıları | başka firma UUID'si → şube UUID sızıntısı | `NULL` | eski fonksiyonda sızıntı **gösterildi**, yenide `NULL`; `branch-helpers-guard.test.mjs` 8/8 |
| V-05 Sayfa yetkisi | layout'a bağımlı yazma sayfaları | sayfa düzeyi kontrol | `tsc` + inceleme; tarayıcı testi yok |
| R-01 Başlıklar | yok | yayında (yerel sunucuda `curl -I` ile görüldü) | HSTS, nosniff, X-Frame-Options, `frame-ancestors`, Referrer-Policy, Permissions-Policy; `X-Powered-By` kalktı; CSP Report-Only |

## Veritabanı güvenliği (değişmeyen güçlü yanlar, bu oturumda tarandı)
- 248 `public` fonksiyonunun 217'si `SECURITY DEFINER`; **hepsinde `search_path` sabit**; dinamik SQL yok; `anon` hiçbir fonksiyonu çalıştıramıyor.
- İstemciden okunabilen her firma tablosunda restrictive firma izolasyonu var (istisnalar `support_requests`, `company_catalogs`: kendi firma koşullu politikaları var).
- `USING (true)` olan 14 politika envanter/iptal geçmişi tablolarında; hepsi firma izolasyonunun arkasında.
- Korumasız görünen 5 `SECURITY DEFINER` fonksiyon incelendi: kasa (vault) fonksiyonları oturum jetonuyla (`vault_require_session`) korunuyor; `set_user_head_office` her çağrıda hata veriyor (devre dışı); `personnel_branch_on`/`vehicle_branch_on` düzeltildi (V-04).
- Yeni `platform_events` tablosu RPC-only, `anon`/`authenticated` yetkisi yok (canlıda anon probe ile `42501` doğrulandı).

## Doğrulanamayanlar (erişim yok — "yapılandırılmış" denmiyor)
Supabase Auth: CAPTCHA, giriş/kayıt oran sınırı, e-posta doğrulama, parola politikası, Redirect URL izin listesi, oturum süreleri, yedekleme/PITR. Vercel: ortam değişkenleri, önizleme/üretim ayrımı. Kontrol listesi `MKOPS_CANLIYA_GECIS.md`'de.

## Açık (düzeltilmeyen) bulgular
1. Zod 3→4 (yüksek uyarı, düşük gerçek risk) — planlı iş.
2. CSP zorunlu değil (yalnızca rapor) — izleme sonrası.
3. Hata izleme (Sentry) yok — onay bekliyor.
4. Süper admin MFA/AAL2 yok — kurtarma prosedürüyle birlikte onay bekliyor.
5. `delete-user` Edge Function: mesajlarda eski "şantiye şefi" adlandırması ve oran sınırı yok (deploy gerektirir) — dokunulmadı.
6. Ön yüz/E2E testleri yok.
