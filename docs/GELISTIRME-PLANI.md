# MK OPS — Geliştirme Planı

Son güncelleme: 6 Ekim 2026 (onay akışı ve ekip payı kapsam dışı bırakıldı)

Bu dosya, üzerinde çalışılacak geliştirmelerin listesidir. Eski MK-OPS projesi
(`PORTFÖY/PANEL/MK-OPS`) silindiği için oradan alınacak fikirlerin iş mantığı
da burada özetlenmiştir; artık tek referans bu dosyadır.

> Eski MK-OPS'un bir kısmı Vite/React ile yazılmıştı ve iş verilerinin bir kısmını
> tarayıcıda (localStorage) tutuyordu. Bu yüzden kod kopyalanmayacak; iş mantığı
> MK OPS'un veritabanı merkezli yapısına (RLS, şirket ayrımı, SECURITY DEFINER
> fonksiyonlar) yeniden yazılacak.

---

## Mevcut durum (canlıda)

| Adım | İçerik | Durum |
|---|---|---|
| 1 | Başlangıç şeması (85 migration → tek baseline) | ✅ |
| 2 | Çoklu şirket altyapısı (company_id, RLS, yazma koruması, bileşik FK) | ✅ |
| 3 | Şirket kurma, kodla katılma, 48 saatlik deneme | ✅ |
| 4 | Süper admin paneli, destek talepleri, plan atama | ✅ |
| 5 | Landing sayfası, panel `/panel` altında, yasal sayfalar | ✅ |
| 6 | Sektörden bağımsız proje modülü (türler, aşamalar, bölümler, metraj) | ✅ |
| 7 | Hakediş: aşama/proje birim fiyatı, fiyat sabitleme, dönem raporu, Excel, Genel Bakış kartı, "Hakediş" modül yetkisi | ✅ |
| 7a | İş planında ekibe araç atamak opsiyonel | ✅ |
| 8 | Firma logosu ve adı tüm çıktılarda; hakediş PDF'i (logo filigranlı) | ✅ |
| 9 | Denetim kaydı: veritabanı tetikleyicisiyle işlem geçmişi, Ayarlar → İşlem Geçmişi | ✅ |
| 10 | Malzeme stoku: firmaya özel kategoriler, çoklu depo, depolar arası sevkiyat (telekom kategorileri ve Biga şubesi kaldırıldı) | ✅ |
| 11 | Kullanım kılavuzu `/kilavuz` (herkese açık; panel menüsünden ve site alt bilgisinden bağlantı) | ✅ |
| 12 | Firma gizli alanı: Ayarlar'da firma şifresi, şifreyle açılan ortak gizli notlar (sunucu korumalı); küçük işler | ✅ |
| 13 | Panel başlığında firma logosu | ✅ |
| 14 | İmalatlar projeye bağlı: iş kalemi satırları projeye iş kaydı açar (ilerleme + hakediş); fiyatlı ek işler hakedişe dahil | ✅ |

Kurulu migration'lar: `20261005000000` … `20261011000001`. Kurulacak: `20261011000002_inventory_messages.sql`.
**Kural:** Kurulmuş bir migration dosyası asla değiştirilmez; her değişiklik yeni dosyadır.

---

## Bekleyen küçük işler

- [x] Veritabanı hata mesajlarındaki "şantiye şefi" ifadelerini "ana yönetici" yap (`20261012000001`).
- [x] `sync_project_stage_rows` ve `refresh_project_rollup` iç fonksiyonlarında `authenticated` çalıştırma yetkisini kaldır (`20261012000001`).
- [x] `src/app/(app)` boş klasörü silindi.

---

## Öncelikli geliştirmeler

### 1. Hakediş (iş değeri ve dönem raporu)

> ✅ Yapıldı: `20261008000001_hakedis.sql` + `/panel/hakedis`. PDF çıktısı madde 2 ile eklendi.

**Amaç:** Firmanın yaptığı işin parasal değerini proje, aşama ve dönem bazında
hesaplamak. Müteahhitler için ana satış özelliği.

**Kapsam kararı:** MK OPS'ta sahada sabit ekip/taşeron hesabı yok; iş kayıtlarını
ofisteki yöneticiler giriyor. Bu yüzden **ekip payı / taşeron payı hesaplanmaz** ve
**onay adımı yoktur** — iş kaydı girildiği anda hakedişe sayılır.

**Eski MK-OPS'tan alınan mantık:**
- İş kalemi birim fiyatı (`numeric(12,2)`), hesap kuruşa yuvarlanır:
  `iş_değeri = miktar × birim_fiyat`.
- **Hakediş dönemi:** firma ayarında `dönem_başlangıç_günü` (1–28). Dönem o günden başlar,
  bir sonraki ayın aynı gününden bir gün önce biter.
  - Örnek: başlangıç günü 20 → 20 Şubat – 19 Mart.
  - Bugünü içeren dönem "aktif dönem"dir; geçmiş dönemler listelenir.
- Dashboard: günlük / haftalık / aktif dönem toplamları.
- Rapor: dönem seçilir; proje ve aşama bazında özet ve iş listesi; Excel ve PDF çıktısı
  (PDF'te firma logosu filigranı, bkz. madde 2).

**MK OPS'a uyarlama önerisi:**
- Aşamalarda zaten `birim` ve iş kayıtlarında `miktar` var (`project_stage_logs.quantity`).
- Birim fiyat iki seviyede tanımlanabilmeli:
  - Proje türü aşamasında varsayılan fiyat (`project_type_stages.unit_price`).
  - Projeye özel fiyat ile ezilebilmesi (`project_stage_progress.unit_price`).
- İş kaydına hesap anındaki fiyat **sabitlenmeli** (`project_stage_logs.unit_price_snapshot`),
  böylece sonradan fiyat değişse de geçmiş hakediş değişmez.
- İş kaydındaki ekip şefi (`team_leader_personnel_id`) yalnızca **bilgi amaçlı döküm** için
  kullanılabilir (ör. "bu dönem kim ne kadar iş yaptı"); pay hesabı yapılmaz.
- Dönem başlangıç günü: `companies.payroll_start_day`.
- Para birimi: `companies.currency_code` (varsayılan TRY), tutarlar `numeric(12,2)`.
- Fiyatları kimin göreceği: ana yönetici + yetki verilen roller (modül yetkisi olarak).

### 2. Firma logosu ve adı (raporlarda)

> ✅ Yapıldı: `20261009000001_company_logo.sql`, Ayarlar → Firma Logosu. Logo PNG/JPG/WEBP, en fazla 2 MB (SVG güvenlik nedeniyle kabul edilmiyor). Logo değişikliğinin denetim kaydı madde 3 ile gelecek. İş planı tablosundaki "FİRMA" sütunu kaldırıldı (tek firmada hep aynı değerdi).

**Amaç:** Bütün PDF/Word/Excel çıktılarında "MK OPS" yerine müşterinin kendi adı ve logosu.

**Eski MK-OPS'taki mantık:**
- Supabase Storage bucket'ı `company-logos` (herkese açık okuma).
- PNG, JPG, SVG kabul edilir, en fazla 2 MB. URL `companies.logo_url` alanında tutulur.
- Logo değişikliği denetim kaydı üretir (`COMPANY_LOGO_CHANGED`).
- PDF filigranı:
  1. Logo `fetch` ile indirilir.
  2. SVG ise önce PNG'ye çevrilir (canvas üzerinden).
  3. Görsel boyutları okunur.
  4. Saydamlık canvas'ta görsele işlenir (`bakeWatermarkOpacity`).
  5. Sayfanın ortasına orantılı yerleştirilir.
  6. Sonuç, aynı dışa aktarma oturumunda URL bazında önbelleğe alınır.

**MK OPS'a uyarlama önerisi:**
- `companies.logo_url` + Storage bucket (şirket klasörüne göre RLS: yalnızca ana yönetici yükler).
- Ayarlar → Firma Bilgileri'ne logo yükleme.
- `src/lib/constants/brand.ts` içindeki `APP_NAME` / `APP_LOGO_SRC` kullanımları, raporlarda
  şirket adı ve logosuyla değiştirilecek. Değişecek dosyalar: `attendance-word.ts`,
  `production-pdf.ts`, `production-word.ts`, `notes-pdf.ts`, `vehicle-equipment-word.ts`,
  `inventory-export.ts`, iş planı WhatsApp görseli.
- Logo yoksa şirket adı yazılır.

### 3. Denetim kaydı (Audit Log)

> ✅ Yapıldı: `20261010000001_audit_log.sql` + `/panel/settings/islem-gecmisi`. Kayda girenler: projeler, proje türleri, bölümler, aşamalar, iş kayıtları, hakediş fiyatları, personel, avans, araçlar, malzeme tanımları, iş planı, imalat, kullanıcı rolleri, modül yetkileri, firma ayarları. Puantajın kendi denetim kaydı ayrı. Stok hareketleri ve zimmet zaten kendi hareket tablolarında kim/ne zaman bilgisiyle tutuluyor. Yalnızca doğrudan değişiklikler yazılır (türetilmiş/zincirleme güncellemeler yazılmaz); TC kimlik no maskelenir.

**Amaç:** "Kim, ne zaman, neyi değiştirdi" kaydı. Landing'de bu iddia var; şu an yalnızca
puantajda tam karşılığı bulunuyor.

**Eski MK-OPS'taki yapı (`audit_logs`):**
`id, created_at, actor_user_id, actor_email, actor_role, action, entity_type, entity_id,
period_id, team_code, project_id, user_agent, meta jsonb`.

Kayıt üretilen işlemler:
- `JOB_CREATED/SUBMITTED/APPROVED/REJECTED/UPDATED`
- `TEAM_CREATED/UPDATED/APPROVED/REJECTED/WIPED`
- `STOCK_ADD/EDIT/DELETE`, `DELIVERY_NOTE_RECEIVE`
- `MATERIAL_DISTRIBUTE_TO_TEAM`, `MATERIAL_RETURN_TO_STOCK`, `MATERIAL_TRANSFER_BETWEEN_TEAMS`
- `USER_UPDATED`, `COMPANY_LOGO_CHANGED`

Eski projede görünürlük role göre ayrılıyordu. Bizde yalnızca ana yönetici (ve yetki verilenler) görür.

**MK OPS'a uyarlama önerisi:**
- Eski projedeki uygulama içi `writeAudit(...)` çağrıları yerine **veritabanı tetikleyicileri**
  kullanılsın. Önemli tablolarda (projeler, aşama kayıtları, stok hareketleri, zimmet,
  kullanıcı rolleri, şirket ayarları) INSERT/UPDATE/DELETE'te eski/yeni değer farkını yazan
  tek, genel bir tetikleyici.
- `company_id` ve şirket ayrımı politikası diğer tablolarla aynı.
- Kayıtlar değiştirilemez ve silinemez (yalnızca ekleme).
- Ayarlar'da "İşlem Geçmişi" ekranı: tarih, kullanıcı ve modül filtresi.

### 4. Kullanım kılavuzu

> ✅ Yapıldı: `src/app/(legal)/kilavuz/page.tsx`. Yeni özellik eklendikçe ilgili bölüm güncellenmeli.

**Eski kılavuzun bölümleri:**
1. Giriş ve Üyelik Kuralları
2. Roller, Sistem Yapısı ve Yetkiler
3. İş Akışı, İş Takibi ve Fiyatlandırma
4. İrsaliye ve Malzeme Stoku Yönetimi
5. Denetim Günlüğü, Fiyatlandırma Görünürlüğü ve Bildirimler
6. Bilgilendirme ve İletişim

**MK OPS için önerilen bölümler** (`/kilavuz`, herkese açık; panelden de bağlantı):
1. Firma kurma, katılım kodu ve kullanıcı onayı
2. Roller ve modül yetkileri (Ana Yönetici, Yönetici, Muhasebe)
3. Proje türleri, aşamalar, bölümler ve metraj
4. Günlük iş planı ve WhatsApp paylaşımı
5. Personel, puantaj ve avans
6. Malzeme stoku, irsaliye ve zimmet
7. Araçlar, yakıt ve ekipman
8. Günlük imalat raporu
9. Deneme süresi, plan talebi ve destek

---

## Sonra değerlendirilecekler

### Bildirimler
Eski yapı:
- `notifications`: `company_id, type, title_key, meta jsonb, created_at`
- `notification_reads`: `notification_id, user_id, read_at` (benzersiz çift)

Yönetici uygulamayı açınca hangi cihazdan girerse girsin okunmamış bildirimleri görür.
Örnek olaylar: katılma isteği geldi, destek talebi yanıtlandı, proje gecikti, planlanan
bitişe 3 gün kaldı, araç muayenesi yaklaşıyor, deneme süresi bitiyor.

### SEO çözüm sayfaları
Eski projede konu sayfaları vardı; sunucu tarafında önceden üretiliyor (prerender), her biri ayrı adreste:
- `gunluk-is-takibi` — Günlük saha işi takip sistemi
- `hakedis-takibi` — Saha hakediş takip sistemi
- `irsaliye-malzeme-takibi` — İrsaliye ve saha malzeme takibi
- `operasyon-raporlama` — Saha operasyon ve hakediş raporlama
- `denetim-gunlugu` — Saha operasyonları denetim günlüğü
- `telekom-saha-takibi` ve `saha-onay-surecleri` — sektöre özgü / bizde onay akışı olmadığı için **alınmayacak**

Sayfa yapısı: giriş, sorun, 3 bölüm, adımlar, kimler için, SSS, ilgili sayfalar.
Next.js'te `src/app/(marketing)/cozumler/[slug]` olarak, sektörden bağımsız içerikle yazılabilir.
Yalnızca gerçekten var olan özellikler anlatılmalı.

### Para birimi ve ondalık
`companies.currency_code` (TRY varsayılan), tüm tutarlar `numeric(12,2)`, gösterimde
`Intl.NumberFormat("tr-TR", { style: "currency" })`. Hakedişle birlikte.

### Otomatik testler
Eski projede `security.test.mjs`, `security-db.test.mjs` (PGlite) ve `seo.test.mjs` vardı.

MK OPS'ta da PGlite tabanlı bir test düzeneği kullanıldı, ama şu an yalnızca geçici klasörde duruyor. İçeriği:
- Supabase taklidi: `auth.users`, `auth.uid()`, `storage`, roller, varsayılan yetkiler
- Migration'ları sırayla kuran `replay`
- Şirketler arası testler (47)
- Kayıt ve katılım testleri (35)
- Proje modeli testleri (15)

Bunlar depoya `tests/db/` olarak alınmalı ve `npm run test:db` ile çalıştırılmalı.
İleride GitHub Actions'ta her PR'da çalışması sağlanmalı.

---

## Bilerek alınmayanlar

| Eski MK-OPS özelliği | Neden alınmıyor |
|---|---|
| **İş onay akışı** (taslak → onaya gönder → onayla/reddet) | Kayıtları ofisteki yöneticiler giriyor; sahada kayıt giren sabit ekip yok. Ek onay adımı gereksiz iş yükü olur. |
| **Ekipler, ekip lideri hesabı, ekip/taşeron payı (%)** | Sistemde sabit ekip yok; ekipler günlük iş planında her gün yeniden kuruluyor. Pay hesabı bu yapıya ters düşer. |
| **Onay anında zimmetten malzeme düşme** | Onay akışına bağlıydı; bizde zimmet ve stok hareketleri depo modülünde ayrı yönetiliyor. |
| **5 dil desteği** | Şimdilik yalnızca Türkiye pazarı. |
| **Ödeme sağlayıcısı ile plan değişimi** | EFT + süper admin plan ataması kullanılıyor. |

---

## Diğer planlı işler

### Çoklu şube ve genel depo kategorileri
- "Biga Şube" kaldırılacak, yerine `inventory_branches` gelecek: varsayılan **Merkez Depo**, ve istenildiği kadar şube.
- Malzeme miktarı şube bazında tutulacak; sevkiyat "Merkez → seçilen şube" olacak.
- Silme, geri alma ve yeterlilik kontrolleri yeniden yazılacak.
- Depo kategorileri (şu an sabit ve telekoma özel: fiber kablo, bakır şebeke, fiber ek, yeraltı)
  firmanın kendi tanımladığı kategorilere dönüşecek.

### KVKK
- Yasal metinler bir avukata kontrol ettirilecek.
- Personel verisi için aydınlatma metni şablonu.
- Veri silme ve dışa aktarma talebi akışı.
