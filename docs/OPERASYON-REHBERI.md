# MK OPS — Operasyon rehberi (kod dışı, panel gerektiren işler)

Bu belge, kodla yapılamayan ve **sizin Supabase / Vercel / Sentry / Cloudflare panellerinizde** yapılması gereken
işleri sırayla anlatır. Hiçbir gizli anahtar buraya yazılmaz.

Durum özeti (10 Kasım 2026):

| # | Konu | Durum |
|---|---|---|
| 6 | `delete-user` Edge Function dağıtımı | Sizin işleminiz: bölüm 1 |
| 7 | Hata izleme (Sentry) | **Kod hazır**, hesap + DSN gerekli: bölüm 2 |
| 8 | Süper admin MFA | **Kod hazır**, migration + doğrulayıcı ekleme: bölüm 3 |
| 9 | CSP'yi zorunlu yapma | İzleme gerekir: bölüm 4 |
| 10 | Yedekleme | Panel kontrolü: bölüm 5 |
| 11 | Auth ayarları | Panel kontrolü: bölüm 6 |
| 12 | Staging (deneme ortamı) | Karar + kurulum: bölüm 7 |
| 13 | npm uyarıları, Zod 4 | **Tamam** (kalan: Next 16): bölüm 8 |
| 14 | `service_role` / JWT secret yenileme | İsteğe bağlı: bölüm 9 |

---

## 1. `delete-user` Edge Function'ını dağıtma (madde 6)

Yalnızca hata mesajları değişti ("firma yöneticisi"); acil değil ama canlıdaki sürümle depodaki aynı olsun.

**Terminalde (önerilen):**
```bash
npx supabase login                         # tarayıcıda açılır; Supabase hesabınızla onaylayın
npx supabase link --project-ref <MK-OPS-PROJE-REFI>   # DİKKAT: AZG/mk-takip projesi DEĞİL, MK OPS projesi
npx supabase functions deploy delete-user
```
- `project-ref`, Supabase paneli → Project Settings → General → "Reference ID". **MK OPS projesini seçtiğinizden emin olun.**
- `supabase/config.toml` içinde `verify_jwt = true` zaten ayarlı.
- Fonksiyonun kendi sır değişkenleri (`SUPABASE_SERVICE_ROLE_KEY` vb.) Supabase tarafından otomatik verilir; sizin bir şey girmeniz gerekmez.

**Panelden alternatif:** Edge Functions → `delete-user` → Edit → `supabase/functions/delete-user/index.ts` içeriğini yapıştırıp Deploy.

**Doğrulama:** Test kullanıcısı silmeyi deneyin; yetkisiz kişi için "firma yöneticisi" mesajı gelmeli. Sorun olursa Edge Functions → Logs.

## 2. Hata izleme — Sentry kurulumu (madde 7)

Kod hazır ve **DSN verilmedikçe tamamen kapalıdır** (SDK indirilmez). Kişisel veri (TC kimlik, e-posta, telefon,
çerez, istek gövdesi) gönderilmez; hata metinlerindeki 9+ haneli sayılar ve e-postalar maskelenir.

1. https://sentry.io → hesap açın (ücretsiz plan yeterli başlangıçta). Veri bölgesi olarak **AB (EU/DE)** seçin (KVKK için tercih).
2. **Create Project** → platform **Next.js** → ad `mk-ops`. Size bir **DSN** verir (`https://…@…ingest.de.sentry.io/…`).
3. Vercel → Project → Settings → Environment Variables → **Production** (isterseniz Preview): `NEXT_PUBLIC_SENTRY_DSN` = DSN.
   DSN gizli değildir (tarayıcıya gömülür); yine de yalnızca Production'a ekleyin.
4. Yeniden dağıtın (Redeploy). `NEXT_PUBLIC_*` değişkenleri derleme anında gömülür.
5. Sentry → Alerts → "Send a notification for new issues" kuralını e-postanıza açın.
6. **Deneme:** panelde bir hata ekranı üretin ya da tarayıcı konsolunda `throw new Error("sentry deneme")` çalıştırıp Sentry'de
   olayın göründüğünü, **içinde e-posta/TC olmadığını** kontrol edin.

Notlar: Kaynak haritası yüklenmiyor (hata izinde küçültülmüş dosya adları görünür); gerekirse sonra `SENTRY_AUTH_TOKEN` ile eklenir.
Performans izleme ve oturum kaydı **kapalı**. İnternet kaynaklı gürültü ("Failed to fetch" vb.) yok sayılır.

## 3. Süper admin iki adımlı doğrulama (madde 8)

Sıra önemli — kilitlenmemek için:
1. `supabase/migrations/20261123000001_super_admin_mfa.sql` dosyasını SQL Editor'de çalıştırın (migration kendi kendini denetler;
   `auth.mfa_factors` okunamıyorsa durur ve hiçbir şey değiştirmez). Bu aşamada kimse etkilenmez (faktör yok).
2. Kodu yayınlayın (PR'ı birleştirin).
3. Süper admin ile girin → **Güvenlik (2 adım)** → "İki adımlı doğrulamayı aç" → QR'ı doğrulayıcı uygulamayla okutun, kodu girin.
4. **Hemen ikinci bir cihaz/uygulama ekleyin** (yedek).
5. Çıkış yapıp tekrar girin: şifreden sonra kod ekranı gelmeli; kodla `/admin` açılmalı.
6. Kurtarma yolunu bir kez okuyun: `docs/dahili/yonetici-mfa-kurtarma.md`.

Supabase tarafında TOTP'nin açık olduğundan emin olun: Authentication → Sign In / Providers (veya Multi-Factor) → TOTP **Enabled**.
Açık değilse "Güvenlik" sayfasında doğrulayıcı eklerken hata alırsınız; panelden açın.

## 4. CSP'yi zorunlu yapma (madde 9)

Şu an `Content-Security-Policy-Report-Only` (ihlalleri yalnızca bildirir, engellemez). Zorunlu yapmak yanlış yapılırsa **sitenin
bozulmasına** neden olur (Next.js satır içi betikleri, Turnstile, Google Analytics, Supabase). Bu yüzden:
1. Tarayıcıda siteyi gezin (giriş, panel, admin, tanıtım) ve Geliştirici Araçları → Console'da "Content Security Policy" uyarılarına bakın.
2. Uyarı yoksa ya da yalnızca bilinen/zararsız ise bir hafta daha izleyin.
3. Sonra `next.config.ts` içinde Report-Only başlığını zorunlu başlığa çevirmeyi **ayrı bir PR** olarak yapın (geri alması tek satır).
4. Sentry açıkken CSP ihlal raporlarını `report-uri` ile ona yönlendirmek mümkün; istenirse ayrı iş.
`script-src` içindeki `'unsafe-inline'` kalkmadan CSP'nin XSS'e karşı faydası sınırlıdır; nonce'lu yapıya geçiş büyük bir iştir.

## 5. Yedekleme (madde 10)

Supabase paneli → Project → **Database → Backups** (ve Settings → Billing, plan):
- Plan **Free** ise otomatik günlük yedek **yoktur** (veya çok sınırlıdır). Gerçek müşteri verisi için **Pro** plana geçmek ya da
  düzenli elle dump almak gerekir.
- Plan **Pro** ise günlük yedek (7 gün) vardır; **Point-in-Time Recovery** ayrı eklentidir.
- Kontrol listesi: [ ] plan ne? [ ] son yedek tarihi görünüyor mu? [ ] bir yedeği **test projesine** geri yükleyip denediniz mi?
- Elle dump (örnek, migration öncesi iyi alışkanlık): Database → Backups → Download, ya da
  `npx supabase db dump --linked -f yedek.sql` (dosyayı repoya koymayın).
Ayrıntılı senaryolar: `docs/dahili/yedekleme-ve-geri-donus.md`.

## 6. Supabase Auth ayarları (madde 11)

Authentication → Sign In / Providers, URL Configuration, Attack Protection, Rate Limits:
- [ ] **Site URL** = `https://www.mk-ops.tr`; **Redirect URLs** yalnızca üretim (ve gerekirse önizleme) adresleri.
- [ ] **Confirm email** açık (kayıt sonrası e-posta doğrulama).
- [ ] **CAPTCHA** açık, sağlayıcı Turnstile (yapıldı).
- [ ] **Minimum şifre uzunluğu** ≥ 8 (uygulama 8 istiyor).
- [ ] **Leaked password protection** ("Prevent use of leaked passwords"): panelde *Configure in email provider* ile açılır;
  **Pro plan özelliğidir**, Free'de kapalıdır. Plan yükseltilince açın.
- [ ] **E-posta şablonları** (Türkçe) ve **SMTP**: varsayılan Supabase göndericisi saatlik düşük limitlidir; müşteri artınca kendi
  SMTP'nizi ekleyin (`docs/EPOSTA-AYARLARI.md`).
- [ ] **Rate limits** varsayılandan gevşetilmemiş olsun.
- [ ] **TOTP (MFA)** etkin (bölüm 3).

## 7. Staging — ayrı deneme ortamı (madde 12)

Sorun: Vercel önizlemelerinde Supabase değişkenleri yok (bilerek: önizleme **canlı veriye bağlanmasın**). Bu yüzden önizlemede
giriş sayfası bile açılmaz ve değişiklikler yalnızca testlerle doğrulanır.

Önerilen çözüm: **ikinci bir Supabase projesi** (ücretsiz plan yeterli):
1. Supabase → New project → `mk-ops-staging` (üretimden **ayrı** proje; AZG projesiyle karıştırmayın).
2. SQL Editor'de `supabase/migrations/` içindeki **bütün dosyaları tarih sırasıyla** çalıştırın (üretimdeki sırayla aynı).
3. Vercel → Environment Variables → **Preview** ortamı için `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerlerine
   **staging** projesinin bilgilerini girin (üretimin değil!). Turnstile için test site key kullanın veya boş bırakın.
4. Staging'de bir süper admin ve test firması açın; gerçek müşteri verisi **asla** kopyalamayın.
5. Her PR önizlemesi artık staging'e bağlanır; riskli işleri (plan atama, silme) orada deneyin.
Maliyet: ücretsiz planda proje 7 gün hareketsizlikte uyur; ilk istek gecikir. Bu iş **isteğe bağlıdır**; ilk müşteriler gelince değerlenir.

## 8. Bağımlılık uyarıları (madde 13) — yapıldı

- **Zod 3 → 4** yapıldı (formlar, 33 kontrol). Hata metinleri artık Türkçe.
- `exceljs`'in `uuid` bağımlılığı `overrides` ile güncellendi (Excel üretimi denendi).
- Kalan **üretim** uyarısı: `next` içindeki `postcss` (XSS/dosya okuma; yalnızca güvenilmeyen CSS işlenirken tehlikeli — bizde yok).
  Çözüm Next 16'ya geçiştir (büyük sürüm; ayrı, planlı bir iş). Kalan diğerleri yalnızca geliştirme araçlarında (eslint).

## 9. `service_role` / JWT secret yenileme (madde 14, isteğe bağlı)

Vercel'den silinen anahtarlar bir süre (günler) orada durdu. Vercel'e yetkisiz erişim şüpheniz **yoksa** zorunlu değildir.
Şüphe varsa: Supabase → Project Settings → API Keys → `service_role`/secret anahtarı **yeniden oluşturun**.
- Edge Function (`delete-user`) kendi anahtarını Supabase'ten alır; yenilemeden sonra yeniden dağıtmanız gerekmeyebilir, denemek için silme akışını test edin.
- **JWT secret'ı yenilemek tüm kullanıcıların oturumunu kapatır** ve anon/service anahtarlarını değiştirir (Vercel'deki
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` güncellenip yeniden dağıtım gerekir). Yalnızca ciddi şüphede yapın.
