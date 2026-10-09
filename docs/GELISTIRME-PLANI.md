# MK OPS — Geliştirme Planı

Son güncelleme: 9 Ekim 2026 (yeni rol yapısı; ekip başı, onay akışı ve şubeler plana alındı)

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
| 15 | Veritabanı testleri depoda: `tests/db`, `npm run test:db` (234 kontrol), GitHub Actions | ✅ |
| 16 | Bildirimler: durumdan hesaplanan, yetkiye göre süzülen bildirim zili | ✅ |
| 17 | İmalatlar: "İş Planından Doldur" (o günün ekipleri ve projeleri forma gelir) | ✅ |
| 18 | SEO çözüm sayfaları `/cozumler` (6 konu, SSS yapılandırılmış verisi, site haritası) | ✅ |
| 19 | Kullanılmayan imalat kalemi tanımları tablosu kaldırıldı | ✅ |
| 20 | Stok Excel/PDF çıktısında elle yazılan üst başlık ve isteğe bağlı logo | ✅ |
| 21 | İş planında proje listeden seçilir (project_id kaydedilir); İş Planından Doldur bunu kullanır | ✅ |
| 22 | KVKK belgeleri (/kvkk), çalışan aydınlatma metni oluşturucu, Türkçe e-posta şablonları, Pazar otomatik hafta tatili (pg_cron) | ✅ |
| 23 | Rol yapısı: Firma Yöneticisi (birden fazla, kurucu korumalı), Şantiye Şefi, Muhasebe; yeni yan menü, her sayfada ad/rol/yetki bandı (`20261017000001_roles.sql`) | ✅ |
| 24 | Onaylar: muhasebenin eklediği personel/araç onayı, ay sonu puantaj onayı (onaylı ay kilitli); proje türleri Projeler sayfasına taşındı (`20261018000001_approvals.sql`) | ✅ |
| 25 | Ekipler (ekip başı + isteğe bağlı taşeron) ve taşeronlar: taşerona göre pay yüzdesi, taşeron hakedişi, harcama/ödeme ve bakiye, taşeron personeli ve ayrı maaş dökümü (`20261019000001_teams_subcontractors.sql`) | ✅ |
| 26 | Taşeron personel kartından tanımlanır ("Kime çalışıyor"); firmanın ödediği maaşlar taşeron alacağından düşer; puantaj ve çıktılarda firma/taşeron ayrı; taşeronluk biterse ekibi firmaya geçer; Ekipler sayfası kaldırıldı (`20261020000001_subcontractor_personnel.sql`) | 🚧 dalda |

Kurulu migration'lar: `20261005000000` … `20261011000001`. Kurulacak: `20261011000002_inventory_messages.sql`.
**Kural:** Kurulmuş bir migration dosyası asla değiştirilmez; her değişiklik yeni dosyadır.

---

## Bekleyen küçük işler

- [x] Veritabanı hata mesajlarındaki "şantiye şefi" ifadelerini "ana yönetici" yap (`20261012000001`).
- [x] `sync_project_stage_rows` ve `refresh_project_rollup` iç fonksiyonlarında `authenticated` çalıştırma yetkisini kaldır (`20261012000001`).
- [x] `src/app/(app)` boş klasörü silindi.
- [ ] `delete-user` Edge Function mesajı hâlâ "şantiye şefi" diyor; bir sonraki function deploy'unda "firma yöneticisi" yapılacak.

---

## Rol yapısı, onay akışı, saha paneli ve şubeler (9 Ekim 2026 kararı)

6 Ekim'deki "onay akışı ve sabit ekip yok" kararı değişti: ekip başları sisteme dahil oluyor ve
kayıtları onaya gönderiyor. Bütün roller paketin kullanıcı limitine sayılır; sahadaki personel sayılmaz.

| Rol | Kapsam | Özet |
|---|---|---|
| **Firma Yöneticisi** (`site_chief`) | Bütün şubeler | Her şey. Şube açar, şef atar, şefe fiyat izni verir. Birden fazla olabilir; kurucu silinemez. |
| **Şantiye Şefi** (`company_manager`) | Atandığı şube(ler) | Operasyonun tamamı; muhasebe ve ekip başı atar; imalat ve aylık puantaj onayı. Fiyatlar yalnızca izinle. |
| **Muhasebe** (`accounting`) | Firma yöneticisinin seçtiği şubeler | Personel, puantaj/izin/avans, araç (yakıt, sigorta, muayene), stok, hakediş (ekip bazlı dahil). Personel ve araç ekler, şef onaylar. İrsaliye teslim alır. |
| **Ekip Başı** (yeni) | Kendi ekibi | Ayrı, telefona uygun saha paneli: kendi ekibinin iş planı, imalat girişi (onaya gider), proje aşamaları (fiyatsız). |

| Aşama | İçerik | Durum |
|---|---|---|
| A | Rol yapısı: çoklu firma yöneticisi, rol sınırlarının kalkması, şefin kullanıcı yönetimi, rol varsayılan yetkileri, muhasebenin araç/stok görünürlüğü ve irsaliye girişi, yeni yan menü | ✅ |
| B | Onaylar: muhasebenin eklediği personel/araç onayı, ay sonu puantaj onayı (onaydan sonra ay kesinleşir; onayı yalnızca firma yöneticisi kaldırır) | ✅ |
| T | Ekipler ve taşeronlar (ofis tarafı); taşeronun kendi girişi sonra, ayrı rol olarak | 🚧 dalda |
| C | Ekip başı rolü ve saha paneli; imalat taslak → onaya gönder → onay/red; ekip bazlı hakediş | ⏳ |
| D | Şubeler: şube tablosu; personel, proje, araç ve depo şubeye bağlı; şefe ve muhasebeye şube atama; şube bazlı veri kısıtı (veritabanında); şubeler arası malzeme gönderme/teslim alma | ⏳ |
| E | Firma yöneticisi için "Bugün" özeti (hangi ekip nerede, ne yaptı, bekleyen onaylar) | ⏳ |

Not (kullanıcıdan): Projede iş kalemleri önceden girilmemişse imalat yazılırken listeden iş kalemi
seçilip projeye doğrudan eklenebilmeli. Mevcut davranış C aşamasında kontrol edilecek.

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

> ✅ Yapıldı: `20261014000001_notifications.sql` (durumdan hesaplanır, okundu bilgisi `notification_reads`), panelde zil.

### SEO çözüm sayfaları

> ✅ Yapıldı: `src/lib/constants/solutions.ts` + `/cozumler/[slug]`: hakediş, günlük iş, malzeme/depo, proje/metraj, puantaj, araç/ekipman. Yeni özellik eklendikçe ilgili sayfa güncellenmeli.

### Para birimi ve ondalık
`companies.currency_code` (TRY varsayılan), tüm tutarlar `numeric(12,2)`, gösterimde
`Intl.NumberFormat("tr-TR", { style: "currency" })`. Hakedişle birlikte.

### Otomatik testler

> ✅ Yapıldı: `tests/db/` (PGlite), `npm run test:db`, `.github/workflows/db-tests.yml`. Ayrıntı: `tests/db/README.md`.

---

## Bilerek alınmayanlar

| Eski MK-OPS özelliği | Neden alınmıyor |
|---|---|
| ~~İş onay akışı~~ | 9 Ekim 2026'da plana alındı (yukarıda C aşaması). |
| ~~Ekip lideri hesabı~~ | 9 Ekim 2026'da "Ekip Başı" olarak plana alındı (C aşaması). Taşeron payı (%) 9 Ekim 2026 kararıyla T aşamasında yapıldı (taşerona göre yüzde). |
| **Onay anında zimmetten malzeme düşme** | Onay akışına bağlıydı; bizde zimmet ve stok hareketleri depo modülünde ayrı yönetiliyor. |
| **5 dil desteği** | Şimdilik yalnızca Türkiye pazarı. |
| **Ödeme sağlayıcısı ile plan değişimi** | EFT + süper admin plan ataması kullanılıyor. |

---

## Diğer planlı işler

### Çoklu şube ve genel depo kategorileri

> ✅ Yapıldı (adım 10): firmaya özel kategoriler, çoklu depo, depolar arası sevkiyat.

### KVKK

> ✅ Yapıldı (adım 22): `/kvkk` altında aydınlatma metni (gizlilik), veri işleme sözleşmesi, saklama ve imha
> politikası, çerez politikası, başvuru formu; panelde Ayarlar → KVKK ile çalışan aydınlatma metni (Word).
> Firma kimlik bilgileri ve alt işleyenler: `src/lib/constants/legal.ts`.

Kalan (işletme tarafı):
- Yasal metinler bir avukata kontrol ettirilecek.
- `LEGAL_ENTITY` adres / vergi / MERSİS / KEP bilgileri doldurulacak.
- Yurt dışı aktarım için Supabase, Vercel ve e-posta sağlayıcısıyla KVKK standart sözleşmesi imzalanıp 5 iş günü içinde Kurul'a bildirilecek.
- VERBİS kayıt yükümlülüğü değerlendirilecek.
- Toplu veri dışa aktarma ve firma silme talebi şu an süper admin üzerinden manuel.

### Resmi tatiller

- Puantajda resmi ve dini bayram günlerinin otomatik işaretlenmesi (ileride).

### E-posta

- Kurulum adımları: `docs/EPOSTA-AYARLARI.md`, şablonlar: `supabase/templates/`.
