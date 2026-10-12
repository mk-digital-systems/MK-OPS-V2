# MK OPS — Geliştirme Planı

Son güncelleme: 12 Ekim 2026 gece (HP ve Kurumsal eklentileri canlıda; F — sektör yapısı ve poz listesi planı)

Bu dosya, üzerinde çalışılacak geliştirmelerin listesidir. Eski MK-OPS projesi
(`PORTFÖY/PANEL/MK-OPS`) silindiği için oradan alınacak fikirlerin iş mantığı
da burada özetlenmiştir; artık tek referans bu dosyadır.

> Eski MK-OPS'un bir kısmı Vite/React ile yazılmıştı ve iş verilerinin bir kısmını
> tarayıcıda (localStorage) tutuyordu. Bu yüzden kod kopyalanmayacak; iş mantığı
> MK OPS'un veritabanı merkezli yapısına (RLS, şirket ayrımı, SECURITY DEFINER
> fonksiyonlar) yeniden yazılacak.

---

## ▶ Sıradaki çalışma — bir sonraki oturumda buradan devam edilecek

12 Ekim 2026 itibarıyla. Yeni oturumda önce bu bölüm okunur, kullanıcıyla hangi başlıktan
devam edileceği kararlaştırılır. Her adım kullanıcının onayıyla ilerler; migration önce
`tests/db` ile denenir, sonra `supabase/migrations` klasörüne konur.

### 📍 Kaldığımız yer (12 Ekim 2026 gece)

- **Bugün canlıya çıkanlar** (`20261029000001` … `20261102000001`, hepsi kurulu, `main`'de):
  - Süper admin → Yönet → **Proje ayarları**: şirket bazında proje eklentileri (HP odaklı / Kurumsal).
  - **HP odaklı proje**: pafta no, HP adedi, adres, görsel ve not ile toplu pafta girişi (Excel'den yapıştırma); pafta
    durumu ve ekip başı; proje durumu paftalardan; **HP raporu** (genel, proje bazında, tarih aralığında tamamlanan HP).
    HP (home pass) yalnızca bilgidir, hakedişe girmez. **Henüz iş kalemi yok**; F'de kalemli olacak.
  - **Kurumsal proje**: durum elle (Başlamadı / Devam ediyor / Kazı izni bekliyor / Bitti), ekip başı, toplam proje
    tarihi, öncelik, lokasyon filtresi.
  - **Projeye göre iş kalemleri ve poz** ("şablondaki hepsi" ya da "projeye göre düzenle"); poz elle, 3–5 karakter.
    F'de bu yapı yeniden ele alınacak.
  - **İmalattaki özel iş kalemi (ek iş)**: fiyatı hakediş yetkilisi Onaylar'da girip onaylar; o zamana kadar hakedişe girmez.
  - BGFD (kabin) türü yapılmayacak: eski, iptal olmuş bir proje türü.
- **Sıradaki iş: F — Sektör yapısı, proje türleri ve poz listesi** (aşağıda). Panel karıştığı için önce bu düzenlenecek.

### F — Sektör yapısı, proje türleri ve poz listesi (12 Ekim 2026 kararı)

**Neden:** proje türleri, şablonlar, eklentiler ve otomatik gelen kalemler birbirine girdi; panel kullanıcı için
karışık hale geldi. Önce hedef sektörler netleştirildi, sonra yapı yeniden kurulacak.

**Kararlar (kullanıcı):**
- Hedef sektörler — ana halka: telekom, doğalgaz, elektrik (dağıtım), su ve kanalizasyon, yol/asfalt/kaldırım altyapısı;
  ikinci halka: inşaat alt yüklenicileri, elektrik-mekanik tesisat, GES kurulum. Hedef dışı: bakım/servis firmaları,
  büyük genel müteahhitler.
- Firma kurulurken sektör seçer; **birden fazla** seçebilir.
- **Biz yalnızca proje türü şablonlarını veririz** (kalemsiz). Firma kabul ederse eklenir; kendi türünü de açabilir.
  Telekom: HP odaklı ve Kurumsal.
- **İş kalemlerini her sektörde firma kendisi girer, pozuyla.** Hiçbir kalem otomatik yüklenmez; biz en fazla öneri sunarız.
- **Poz listesi sektöre göre:** telekomda tek liste bütün telekom türlerinde kullanılır; inşaatta kalemler türe göre
  değişir (kaba: duvar, betonarme; ince: sıva, boya, fayans), bu yüzden bir poz belirli türlerle sınırlanabilir.
  İşverene göre ayrı liste yok.
- **Fiyat:** poz başına tek birim fiyat; **firmaya özel** (iki telekom müşterisinde pozlar aynı olabilir, fiyatlar ayrı).
- **Poz biçimi:** elle girilir, "grup/sıra" gibi (örn. 1/1, 2/1, 12/2); 3–5 karakter, projede tekil.
- **Projede kalemler seçilir:** HP'de kablo ve ek hemen her projede olur; kazı, direk dikimi, ek odası yalnız bazılarında.
  Kalemler proje açılırken seçilir, sonradan eklenip çıkarılır.

**Güncelleme (aynı gün, kullanıcı kararı — aşağıdaki hedef yapının 3. ve 4. maddesini değiştirir):**
- Biz yalnızca **proje türlerini** gireriz; proje türlerinin altında iş kalemi **yoktur**.
- **Poz listesi / iş kalemleri İmalatlar'da** kullanılır ve sektöre göre ayrılır: iki sektör seçen firmada telekom ve
  inşaat imalatları ayrıdır, telekom kalemleri inşaat işinde gösterilmez.
- **Poz listesinin kurulumunu biz yaparız:** müşteri geldiğinde poz listesini alır, **süper admin panelinden** firmaya
  yükleriz. Kurulumun bize ait olması satışta avantaj.

**Son kararlar (aynı gün):**
- **Bütün sektörlerin proje türleri süper admin'den gelir;** firma tür tanımlamaz. **Sektörü de süper admin'den biz seçeriz.**
- **Keşif projede isteğe bağlı** (ör. 2.000 m kablo, 40 ek, 5 dolap):
  - **Keşif girilmişse:** ilerleme imalatlardan hesaplanır. Keşifteki bir kaleme ilk imalat girilince proje
    kendiliğinden "Devam ediyor" olur.
    **Keşif tamamlanınca proje tamamlanmaz** (keşif dışı ekstra iş olabilir); tamamlama her zaman elle.
  - **Keşif yoksa:** imalatlar projede ne yapıldığının dökümünü verir; durum elle seçilir (Devam ediyor / Tamamlandı).
  - Elle "Tamamlandı" her durumda seçilebilir.
- **Poz listesi yetkisi:**
  - İlk yüklemeyi biz süper admin'den yaparız.
  - Firma yöneticisi ve Merkez şantiye şefi poz ekler ve günceller.
  - Firma isterse listesini kendisi de yükleyebilir.

- **Katalog:** "sektör" süper admin'in yönettiği bir katalogdur. Bizim hazırladıklarımız (telekom, inşaat…) dışında
  süper admin sisteme uyan her müşteri için yeni katalog kurar (ör. çok şubeli kuaför, fabrika): katalog, türleri ve
  önerilen kalemleri oluşturup firmaya atar.
- **Canlıda gerçek müşteri verisi yok;** yalnızca demo / kendi hesaplarımız var. Geçiş buna göre sade tutulur; demo
  verisi bile sorulmadan silinmez.

- **Poz listesi yetkileri ve fiyat (kullanıcı onayı):**
  - **Düzenleme:** süper admin, firma yöneticisi ve Merkez şantiye şefi (`is_head_office`).
  - **Diğer roller:** şube şefi, muhasebe ve ekip başı yalnızca görür ve imalatta kullanır.
  - **Silme:** imalatta kullanılmış poz silinmez, **pasife alınır**; pasif poz yeni imalatta listelenmez.
  - **Fiyat:** yalnızca hakediş yetkisi olan görür ve değiştirir. Merkez şefinde bu yetki yoksa fiyatsız düzenler.
  - **Eskalasyon (aylık):** fiyatlar tek tek ya da **toplu yüzdeyle** güncellenir. Yüzde isteğe bağlı olarak bir kataloğa veya
    gruba uygulanır; eski/yeni fiyat önizlemesi gösterilir, kuruşa yuvarlanır, denetim kaydına yazılır.
  - **Yürürlük tarihli fiyat:** zam "şu tarihten itibaren" girilir, fiyat geçmişi tutulur. İş kaydı, imalatta girilen iş
    tarihindeki fiyatı alır. Kaydedilmiş hakediş tutarları sonradan değişmez (bugünkü fiyat sabitleme korunur).

#### F — Veri tasarımı (taslak)

Prensip: mevcut tablolar yeniden kullanılır; kalem kimlikleri korunur, böylece iş kayıtları, hakediş fiyatları ve
imalat bağlantıları kırılmaz. Tablo adları değişmez (fonksiyonlar adla çağırıyor); ekranda "poz" denir.

| Katman | Tablo | Ne olur |
|---|---|---|
| Platform | `catalogs` (yeni) | Katalog: ad, açıklama, hazır mı / özel mi. Yalnızca süper admin. |
| Platform | `catalog_project_types` (yeni) | Katalogdaki türler: ad, renk, ekran tipi (standart / HP pafta / kurumsal). |
| Platform | `catalog_poz_items` (yeni) | Katalogdaki önerilen kalemler: grup, poz no (boş olabilir), ad, birim. |
| Firma | `company_catalogs` (yeni) | Firmaya atanan kataloglar (çoklu). `companies.project_addons` bunun yerine geçer. |
| Firma | `project_types` | Katalogdan kurulan türler (`catalog_type_id` bağı). Firma ekleyemez/düzenleyemez. |
| Firma | `project_type_stages` | **Firmanın poz listesi**: türden bağımsız, katalog (sektör) bağlı; poz no, ad, birim, grup. |
| Firma | `hakedis_stage_prices` | Poz birim fiyatı (değişmez). |
| Proje | `project_stage_progress` | **Keşif / iş satırı**: otomatik oluşmaz; keşif girilince ya da o pozdan ilk imalatta oluşur. Hedef miktar = keşif. |
| Proje | `project_stage_logs` | İmalattan gelen miktar; HP'de isteğe bağlı pafta (`sheet_id`). |
| Kalkan | `project_stages`, `projects.stage_mode`, tür kalem editörü, "projeye göre düzenle" | Yeni yapıda gereksiz; demo verisi poz listesine taşınıp kaldırılır. |

**Durum kuralı (güncel):** keşif tamamlanınca proje **tamamlanmaz**. Keşif projedeki bütün işi kapsamayabilir,
keşif dışı ekstra işçilik olabilir. Keşif %100 olunca "Keşif tamamlandı" göstergesi çıkar; proje "Tamamlandı"yı
**her zaman elle** alır. Otomatik tek kural: keşifli projede ilk imalat → Devam ediyor. Keşif yoksa durum elle.
İlerleme yüzdesi keşfin ilerlemesidir. HP projesinde durum paftalardan (bugünkü gibi).

**Adımlar:**
- **F1 (yapıldı, `20261103000001_catalogs.sql`)** Katalog yapısı ve süper admin ekranı: katalog / tür / önerilen kalem oluşturma, firmaya katalog atama ve türleri kurma;
  firmada tür oluşturma ve düzenleme kapanır; HP / Kurumsal eklentisi kataloğa bağlanır.
- **F2 (yapıldı, `20261104000001_poz_list.sql`)** Firma poz listesi (Poz Listesi sayfası; süper admin'de Şirketler → Yönet → Poz listesini aç): süper admin'den ve firmada (yönetici + Merkez şefi) **elle tek tek ekleme** (Excel'i olmayan
  firmalar için asıl yol), Excel'den toplu yapıştırma, güncelleme, fiyat; katalogdaki önerilen kalemlerden seçerek ekleme.
- **İş bölümü (kullanıcı kararı):** MK OPS yalnızca **ana kurulumu** yapar: katalog, proje türleri, firmanın ilk poz
  listesi ve fiyatları. **Veri girişi firmaya aittir:** proje açma, **keşif**, imalat, sonradan poz/fiyat güncelleme.
  Keşif süper admin'de yoktur; firmada proje yazma yetkisi olanlar girer.
- **F3 (yapıldı, `20261105000001_kesif_imalat_poz.sql`)** Keşif (proje sayfası, firma girer) ve İmalatlar'da projenin kataloğuna göre poz seçimi; HP'de isteğe bağlı pafta; durum kuralı.
- **F4** Eski ekranların ve tabloların kaldırılması; demo verisinin taşınması.
- **F5** Katalog içerikleri: önce telekom (HP odaklı, Kurumsal), sonra diğerleri.

**Hedef yapı (ilk taslak; yukarıdaki kararlar ve veri tasarımı önceliklidir):**
1. **Sektör seçimi:** kurulumda ve Ayarlar'da, çoklu.
2. **Proje türü şablonları:** sektöre göre, kalemsiz; ekran tipiyle (standart / HP pafta / kurumsal).
3. **Poz listesi sayfası** (firma geneli): poz no, kalem adı, birim, birim fiyat, isteğe bağlı grup başlığı, sektör ve
   isteğe bağlı tür sınırı; Excel'den yapıştırma; önerilen kalemleri seçerek ekleme.
4. **Projede kalem seçimi:** türde kullanılabilen pozlardan seçilir; poz no veya adla arama. HP projesi de kalemli olur
   (paftalar + kalemler); iş kaydı girilirken pafta seçmek **isteğe bağlı** (proje toplamı + pafta dökümü).
5. **Hakediş:** miktar × poz birim fiyatı; projeye özel fiyat (bugünkü yapı) kalır.
6. **Geçiş:** bugünkü tür kalemleri ve projeye özel kalemler firmanın poz listesine taşınır; iş kayıtları, ilerleme ve
   hakediş kayıtları korunur. Mevcut kalem tablosunun genişletilmesi mi, yeni tablo mu: F1'de, en az kırılmayla kararlaştırılır.

**Sıra (güncel):** F1 veri tasarımı ve geçiş planı → F2 süper admin'de firma poz listesi kurulumu (sektörlü, Excel'den) →
F3 İmalatlar'da sektöre göre poz seçimi (HP'de isteğe bağlı pafta) → F4 sektör seçimi ve telekom tür şablonları →
F5 diğer sektörler.

**Açık konular:**
- Bölge (müteahhitlik) katsayısı gerçekte var mı? Bilinmiyor; şimdilik eklenmiyor.
- HP / Kurumsal ekranlarını bugünkü gibi süper admin mi açar, yoksa telekom sektörü seçilince mi açılır?
- Telekom öneri listesi: kullanıcının kontrolüyle, poz kodsuz ve kurum adı geçmeden hazırlanacak. İnternetten veya
  yapay zekâdan alınan "Türk Telekom poz listesi" gerçek kaynak değildir; kodları uydurmadır, kullanılmaz.
- Resmi kurumların birim fiyat listeleri (inşaat, yol, su, elektrik) F5'te kaynak ve kullanım şartlarıyla değerlendirilecek.

### Önceki durum (12 Ekim 2026 akşam)

- **Şubeler D3 tamamlandı ve canlıda** (`20261023000001` … `20261028000001`, hepsi kurulu, `main`'de):
  - Her şubeye otomatik "<Şube> Depo"; stokun görünmeme hatası (depo listesi `branch_id` çekmiyordu) düzeldi.
  - **Merkez yetkisi** (`is_head_office()`): firma yöneticisi + Merkez'e atanmış şantiye şefi + firma yöneticisinin
    "Merkez yetkisi" verdiği şef. Bütün şubeleri görür/işler, onay verir, personel/aracın şubesini değiştirir.
  - Şube şefi/muhasebenin eklediği personel ve araç onaya düşer; **Onaylar** sayfası (`/panel/approvals`):
    personel, araç, irsaliye, malzeme talebi, geçen ayın puantajı. Genel Bakış'ta şube düğmeleri ve onay uyarısı.
  - Şube şefi/muhasebenin irsaliyesi kendi şube deposuna "Onay bekliyor" düşer (stok değişmez); Merkez onaylayınca
    stoğa girer. Her bekleyen irsaliye için "<Şube> şubesine malzeme girişi" bildirimi. Giren kişi onaydan önce geri çekebilir.
  - Malzeme talebi şubeye bağlı; talep ve stok girişi onayı Merkez'de; malzeme irsaliye kontrolünde seçilen şube deposuna girer.
  - Personel/araç **şube geçmişi**: kartta geçiş tarihiyle şube değişikliği (yalnızca Merkez). Puantajda ay içi şube
    dağılımı ("Merkez 12 gün · Bolu 5 gün"); yakıt kaydında şube (boşsa aracın o tarihteki şubesi), şube bazında yakıt raporu.
- Veritabanı testleri: 14 dosya, 471 kontrol geçiyor. Tip kontrolü ve lint temiz.
- **Ekranlar tarayıcıda denenmedi.** Kullanıcı canlıda deneyecek: şube irsaliyesi → bildirim → onay; şube talebi akışı;
  kartta geçiş tarihiyle şube değişikliği ve puantajdaki gün dağılımı; yakıtta şube. Gelen geri bildirim ilk iştir.
- **E — "Bugün" özeti yapıldı** (migration yok): Genel Bakış'ın üstünde bugünkü iş planı ekipleri (proje, ekip başı,
  kişi, araç), ekip başının bugün imalat girip girmediği ve kalemleri, iş planı dışı imalat, bugünkü puantaj
  (çalıştı / izin / rapor / gelmedi) ve bütün şubeler seçiliyken şube bazında özet. Menüdeki şube seçimine uyar.
- Sıradaki adaylar: kullanıcının canlı deneme geri bildirimi; C (ekip başı/saha paneli) ertelendi; satış işleri beklemede.
- Kalan şube sınırları (gerekirse ayrı iş):
  - Puantaj listesi ve aylık onay personelin *bugünkü* şubesine göre; ay ortasında şube değiştiren personelin eski
    şubedeki günlerini o şube kendi listesinde görmez/onaylamaz (gün dağılımı yeni şubenin listesinde görünür).
  - Geriye tarihli şube değişikliğinde eski yakıt kayıtlarının şubesi değişmez (puantaj günleri geçmişten hesaplanır, doğrudur).
  - Merkez deposunun stoku `inventory_materials.stock_quantity` içinde; Merkez'e erişimi olmayan şefe
    ekranda gösterilmiyor ama API ile okunabilir (yalnızca miktar). Tam kapatmak stok yapısı değişikliği ister.
  - Mevcut bir deponun şubesi ekrandan değiştirilemiyor (yeni depo menüde seçili şubeye açılır).
- Çalışma düzeni: migration önce scratchpad'de taslak olarak `DRAFT_MIGRATION=... npm run test:db` ile denenir, geçince
  `supabase/migrations`'a konur; kullanıcı Supabase SQL Editor'de çalıştırır (proje `gbguxqaticxrjgsgfvfc`); kurulduğu
  anon RPC denemesiyle doğrulanır ("permission denied" = kurulu), sonra `main`'e commit + push.

### Satış ve pazarlama (kullanıcı kararı: ilk müşteri gelene kadar beklemede)

- [ ] **FATİH Projesi taşeron ilanı:** ilan sahibine tek WhatsApp mesajı (kullanıcı atacak). Mesaj
  "ekip başvurusu için yazmıyorum" diye başlar; uç başı çalışan 10 ilde ekip takibini nasıl
  yapacaklarını sorar; 15 dakikalık demo önerir; fiyat ve henüz olmayan özellik söylenmez.
  Kişi adı ve telefonu bu depoya yazılmaz.
- [ ] **Demo firması:** canlıda demo verisiyle bir firma; "Okul Elektrik ve Data Altyapısı" proje türü
  (sac tava m, PVC kanal m, data/elektrik/topraklama uç adet, sistem odası adet), 3–4 okul, 2–3 ekip,
  bir taşeron. Uç girişinden hakediş ve taşeron ekstresine kadar akış denenir.
- [ ] **Fiyat dosyası:** liste fiyatları kararlaştırıldığı gibi güncellenecek (yalnızca
  `docs/dahili/fiyatlandirma.md`; rakam başka hiçbir dosyaya yazılmaz).
- [ ] **Landing:** WhatsApp "Bilgi Al" düğmesi öne çıkar (mobilde sabit); "saha personeli sınırsız"
  mesajı; kanıt cümlesi "Aktif bir telekom şantiyesinde 3 aydır, 40 kişiye ve 9 ekibe kadar
  kullanılıyor" + diğer sektörlere (inşaat, elektrik…) uygunluk notu. Sayfa telekoma çevrilmez.
  Deneme süresi 48 saat kalır.
- [ ] **Teklif Al formu:** veritabanına kaydetmez, WhatsApp'ı hazır mesajla açar; KVKK onay kutusu.
- [ ] **Çerez onayı + Google etiketi (GA4/Ads):** WhatsApp tıklaması, Teklif Al ve deneme kaydı ayrı
  dönüşüm. Etiket kimliği kullanıcıdan alınacak. Google Ads bundan önce açılmaz.
- [ ] Kurucu teklifi (A: %30 indirim / B: bir üst paket) ve KDV kararı kullanıcıda bekliyor.

### Ürün geliştirme

- [x] **D1 — Şubeler** (`20261021000001_branches.sql`): Merkez + şube açma (Ayarlar), şef/muhasebeye şube
  atama (Kullanıcılar), proje/personel/araç formunda şube, menüde şube seçici (listeler süzülür), şef ve
  muhasebe yalnızca kendi şubeleri (RLS + fonksiyon içi yazma koruması). Kararlar: personel tek şube;
  puantaj onayı şube bazında; malzeme sevkiyatı anında; proje türleri/fiyatlar firma genelinde ortak.
- [x] **D2 — Şubeler (devam)** (`20261022000001_branches_d2.sql`, canlıda): günlük iş planı ve taslaklar
  şube bazında (şube+tarih benzersiz; menüde "Tüm şubeler" seçiliyse Merkez); imalat ekip başının şubesini
  tutar; ay sonu puantaj onayı ve kilidi şube bazında (`get_attendance_month_approvals`); puantaj, hakediş,
  Genel Bakış menüde seçili şubeye göre; bildirimler ve taşeron listesi/ekstresi erişilebilen şubelerle sınırlı;
  depo şubeye bağlı, stok/çıkış/irsaliye yalnızca erişilebilen depolarda, başka şubenin deposuna sevkiyat
  serbest; proje listesinde şube adı.
- [x] **D3 — Merkez yetkisi ve şube onayları** (`20261023000001` … `20261028000001`, canlıda): şube depoları,
  Merkez yetkisi, Onaylar sayfası, şube irsaliyesi onayı, şubeye bağlı malzeme talebi, şube geçmişi, puantajda şube
  dağılımı, yakıtta şube. Ayrıntı yukarıda "Kaldığımız yer"de.
- [x] **E — "Bugün" özeti** (Genel Bakış'ın üstü): hangi ekip nerede, imalat girildi mi, bugünkü puantaj,
  şube bazında kısa özet; bekleyen onaylar ayrıca Onaylar sayfasında ve Genel Bakış uyarısında.
- [ ] **C — Ekip başı ve saha paneli** (ertelendi). Taslak: ekip başı kullanıcısı personel kaydına
  bağlanır; giriş yapınca `/saha` açılır (Bugün · İmalat Gir · Kayıtlarım · Projeler); yalnızca kendi
  ekibi ve kendi imalatı; fiyat görmez; imalat "onay bekliyor" gider, şef/firma yöneticisi onaylar
  ya da gerekçeyle reddeder; onaylanana kadar ilerlemeye, hakedişe ve taşeron hesabına işlenmez.
  Açık sorular: geçmiş günlere giriş (öneri: son 3 gün), fotoğraf (öneri: sonra).
- [x] ~~**İş kalemi notu:**~~ F (sektör yapısı ve poz listesi) ile yeniden ele alınıyor. Eski not: kullanıcıya sorulacak — (a) proje türünde olmayan bir iş kalemi imalatta
  listeden seçilip projeye eklensin mi, yoksa (b) bölümlü projede bölüm açılmadan iş kalemi
  seçilebilsin mi? (Bugün türdeki bütün kalemler projede otomatik hazır; türde olmayan iş "Ek İş" ile girilir.)
- [ ] Taşeron detayındaki "Pay %" rozeti kaldırılsın mı? (Kullanıcıya sorulacak; Excel'de yüzde yok.)
- [ ] Taşeronun kendi girişi (ayrı rol): yalnızca kendi hakedişi, ödemeleri ve ekibi; işveren fiyatı
  veritabanında da gizlenir.

### Küçük teknik işler

- [ ] **`MK-OPS/` klasörü:** eski proje v2 deposunun içinde, izlenmiyor ama içinde `.env` var;
  yanlışlıkla commit edilmesin diye depo dışına taşınmalı (ya da `.git/info/exclude`). Kullanıcıya sorulacak.
- [ ] **`src/app/favicon.ico`:** paletli PNG içeriyor; `npm run dev` (Turbopack) bütün sayfalarda 500
  veriyor (canlı etkilenmiyor). RGBA olarak yeniden üretilecek.
- [ ] **`delete-user` Edge Function:** mesajı hâlâ "şantiye şefi"; "firma yöneticisi" yapılıp deploy edilecek.
- [ ] Kullanılmayan `teams` tablosu (ekip tanımı; taşeron artık personel kartından) — C aşamasında
  ekip başı için kullanılmazsa kaldırılabilir. `personnel.sgk_paid_by_main` kolonu da kullanılmıyor.
- [ ] Ekranlar tarayıcıda uçtan uca denenmedi (rol bandı, yeni menü, onaylar, taşeron, puantaj grupları, şubeler);
  kullanıcı canlıda deniyor, gelen geri bildirime göre düzeltilecek.

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
| 26 | Taşeron personel kartından tanımlanır ("Kime çalışıyor"); firmanın ödediği maaşlar taşeron alacağından düşer; puantaj ve çıktılarda firma/taşeron ayrı; taşeronluk biterse ekibi firmaya geçer; Ekipler sayfası kaldırıldı (`20261020000001_subcontractor_personnel.sql`) | ✅ |
| 27 | Taşeron ekranında ve Excel'inde işveren fiyatı/tutarı gösterilmez, yalnızca taşeronun kendi payı; veritabanı testleri İstanbul saat diliminde (CI düzeltmesi) | ✅ |
| 28 | Şubeler D1: otomatik Merkez, şube açma, şef/muhasebeye şube atama, proje/personel/araç/depo şubeye bağlı, menüde şube seçici, şube bazlı erişim (`20261021000001_branches.sql`) | ✅ |
| 29 | Şubeler D2: iş planı, imalat, puantaj onayı, hakediş, Genel Bakış, bildirimler, taşeron ve stok şube bazında (`20261022000001_branches_d2.sql`) | ✅ |
| 30 | Her şubeye otomatik depo; stok görünmeme hatası düzeltildi (`20261023000001_branch_locations.sql`) | ✅ |
| 31 | Merkez yetkisi (Merkez şefi bütün şubeler), şube şefi/muhasebenin personel/aracı onaya düşer, Onaylar sayfası, Genel Bakış'ta şube seçimi (`20261024000001_head_office.sql`) | ✅ |
| 32 | Merkez yetkisini başka şefe verme; personel/araç şubesini yalnızca Merkez değiştirir (`20261025000001_head_office_grants.sql`) | ✅ |
| 33 | Şube irsaliyesi Merkez onayıyla stoğa girer; malzeme talebi şubeye bağlı (`20261026000001_branch_receipts.sql`) | ✅ |
| 34 | Personel/araç şube geçmişi, puantajda şube dağılımı, yakıtta şube; irsaliye başına bildirim (`20261027000001_branch_history.sql`) | ✅ |
| 35 | Bekleyen irsaliyeyi geri çekme; muhasebe talep irsaliyesini kontrol eder; Genel Bakış araç uyarıları seçili şubeye göre (`20261028000001_receipt_withdraw.sql`) | ✅ |
| 36 | Genel Bakış'ta "Bugün" özeti: ekipler, imalat durumu, bugünkü puantaj, şube özeti | ✅ |

Kurulu migration'lar: `20261005000000` … `20261028000001` (12 Ekim 2026).
**Kural:** Kurulmuş bir migration dosyası asla değiştirilmez; her değişiklik yeni dosyadır.

---

## Bekleyen küçük işler

- [x] Veritabanı hata mesajlarındaki "şantiye şefi" ifadelerini "ana yönetici" yap (`20261012000001`).
- [x] `sync_project_stage_rows` ve `refresh_project_rollup` iç fonksiyonlarında `authenticated` çalıştırma yetkisini kaldır (`20261012000001`).
- [x] `src/app/(app)` boş klasörü silindi.
- [ ] `delete-user` Edge Function mesajı hâlâ "şantiye şefi" diyor (bkz. Sıradaki çalışma → Küçük teknik işler).

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
| T | Taşeronlar (ofis tarafı, personel kartından); taşeronun kendi girişi sonra, ayrı rol olarak | ✅ |
| C | Ekip başı rolü ve saha paneli; imalat taslak → onaya gönder → onay/red; ekip bazlı hakediş | ⏸ Ertelendi (10 Ekim): saha personeli şimdilik sisteme girmeyecek. Ekranların taslağı hazır (aşağıda). Yapılınca ekip başları paket limitine dahil edilecek. |
| D | Şubeler: şube tablosu; personel, proje, araç ve depo şubeye bağlı; şefe ve muhasebeye şube atama; şube bazlı veri kısıtı (veritabanında); şubeler arası malzeme gönderme; Merkez yetkisi ve şube onayları (D1–D3) | ✅ |
| E | Firma yöneticisi için "Bugün" özeti (hangi ekip nerede, ne yaptı, bekleyen onaylar) | ✅ |

Not (kullanıcıdan): Projede iş kalemleri önceden girilmemişse imalat yazılırken listeden iş kalemi
seçilip projeye doğrudan eklenebilmeli. Ayrıntısı yukarıda "Sıradaki çalışma → İş kalemi notu"nda.

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
