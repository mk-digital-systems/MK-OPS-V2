# E-posta ayarları (kayıt doğrulama ve şifre sıfırlama)

MK OPS'un gönderdiği e-postalar (kayıt doğrulama, şifre sıfırlama, e-posta değişikliği) Supabase
Auth üzerinden gider. Varsayılan Supabase göndericisi yalnızca deneme içindir: saatte birkaç e-posta
sınırı vardır ve gönderen "Supabase" görünür. Müşteri almadan önce aşağıdaki adımlar yapılmalıdır.

Bu adımların tamamı panellerden yapılır; kodda değişiklik gerekmez. **Şifreler hiçbir dosyaya
yazılmaz**, yalnızca Supabase panelindeki ilgili alana girilir.

---

## 1. E-posta servis sağlayıcısı seçin

Toplu/işlem e-postası için bir SMTP sağlayıcısı gerekir. Seçenekler:

| Sağlayıcı | Ücretsiz kota | Not |
|---|---|---|
| **Resend** (önerilen) | Ayda 3.000, günde 100 | Kurulumu en kolay; alan adı doğrulaması basit |
| **Brevo** | Günde 300 | Türkçe arayüz, pazarlama e-postası da gönderebilir |
| Mevcut kurumsal posta (Google Workspace, Yandex, hosting) | Sağlayıcıya göre | Günlük gönderim sınırları düşük olabilir |

Gönderen adres olarak alan adınızda ayrı bir adres önerilir: `bildirim@<alanadiniz>` veya
`no-reply@<alanadiniz>`. Yanıtlar için "Reply-To" olarak `iletisim@mk-digitalsystems.com` kullanılabilir.

## 2. Alan adını doğrulayın (SPF / DKIM / DMARC)

Sağlayıcının panelinde alan adınızı ekleyin; size birkaç DNS kaydı verir. Bunları alan adınızın DNS
yönetimine (alan adını aldığınız firma veya Vercel DNS) ekleyin:

- **SPF** (TXT): sağlayıcının sunucularının sizin adınıza gönderebileceğini söyler.
- **DKIM** (TXT/CNAME): e-postaların imzalanması.
- **DMARC** (TXT, `_dmarc`): önerilen başlangıç değeri `v=DMARC1; p=none; rua=mailto:iletisim@mk-digitalsystems.com`

Doğrulama tamamlanmadan e-postalar spam klasörüne düşebilir.

## 3. Supabase'e SMTP bilgilerini girin

Supabase → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*:

| Alan | Değer |
|---|---|
| Sender email | `bildirim@<alanadiniz>` |
| Sender name | `MK OPS` |
| Host | Sağlayıcının verdiği (ör. Resend: `smtp.resend.com`) |
| Port | `465` (SSL) veya `587` (TLS) |
| Username / Password | Sağlayıcının verdiği SMTP kullanıcısı ve şifresi / API anahtarı |

Ardından **Authentication → Rate Limits** bölümünde e-posta gönderim sınırını (ör. saatte 100)
yükseltin.

## 4. Türkçe şablonları yükleyin

Supabase → **Authentication → Emails → Templates**. Her şablon için konu satırını ve HTML'i
`supabase/templates/` klasöründeki dosyadan kopyalayın (konu, dosyanın ilk satırındaki yorumda yazar):

| Supabase şablonu | Dosya | Konu |
|---|---|---|
| Confirm signup | `confirm-signup.html` | MK OPS hesabınızı doğrulayın |
| Reset password | `reset-password.html` | MK OPS şifre sıfırlama |
| Change email address | `change-email.html` | MK OPS e-posta adresi değişikliği |
| Magic link | `magic-link.html` | MK OPS giriş bağlantınız |

Şablonlardaki `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` alanlarını değiştirmeyin;
Supabase bunları gönderim sırasında doldurur.

## 5. Alan adını Supabase ve Vercel'e tanıtın

E-postadaki bağlantıların yeni alan adınıza gitmesi için:

1. Supabase → **Authentication → URL Configuration**
   - **Site URL:** `https://<alanadiniz>`
   - **Redirect URLs:** `https://<alanadiniz>/**` ekleyin (önizleme için
     `https://*-mk-digital6.vercel.app/**` da kalabilir).
2. Vercel → Project → **Settings → Environment Variables**
   - `NEXT_PUBLIC_SITE_URL` = `https://<alanadiniz>` (Production) → ardından yeniden dağıtın.
     Site haritası, arama motoru bağlantıları ve paylaşım önizlemeleri bu adresi kullanır.

## 6. Deneyin

1. Yeni bir e-posta ile kayıt olun → doğrulama e-postası gelmeli, gönderen "MK OPS" olmalı,
   bağlantı `https://<alanadiniz>/auth/callback...` ile başlamalı.
2. Giriş ekranında "Şifremi unuttum" → sıfırlama e-postası gelmeli, bağlantı yeni şifre ekranını açmalı.
3. Gelmezse: sağlayıcının panelindeki gönderim kayıtlarına ve spam klasörüne bakın; Supabase →
   Logs → Auth bölümünde hata mesajı görünür.

## KVKK notu

E-posta sağlayıcısı kişisel veri (e-posta adresi) işler ve sunucuları genellikle yurt dışındadır.
Seçtiğiniz sağlayıcının adı ve ülkesi `src/lib/constants/legal.ts` dosyasındaki hizmet sağlayıcı
listesine yazılmalıdır (aydınlatma metni ve veri işleme sözleşmesinde otomatik görünür).
