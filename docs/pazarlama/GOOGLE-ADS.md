# MK OPS — Google Ads Planı

Son güncelleme: 8 Ekim 2026

Bu belge kampanya yapısını, ayarları, ölçüm kurulumunu ve haftalık bakım rutinini
anlatır. Reklam metinleri ve anahtar kelimeler `google-ads/` klasöründedir:

| Dosya | İçerik |
|---|---|
| `google-ads/REKLAM-METINLERI.md` | Tüm başlıklar, açıklamalar, site bağlantıları; okunabilir hali |
| `google-ads/reklamlar.csv` | Duyarlı arama reklamları, Google Ads Editor'a içe aktarmak için |
| `google-ads/anahtar-kelimeler.csv` | Anahtar kelimeler (eşleme türüyle), Ads Editor için |
| `google-ads/negatif-kelimeler.txt` | Ortak negatif liste, yapıştırmaya hazır |
| `google-ads/uret.mjs` | Yukarıdakileri üreten betik. Metni burada değiştir, yeniden çalıştır; karakter sınırlarını kendisi kontrol eder |

> Reklam metinleri yalnızca `OZELLIKLER.md` dosyasındaki, uygulamada bugün çalışan
> özelliklere dayanır. Yeni iddia eklenecekse önce özellik orada olmalı.

---

## 0. Reklamı açmadan önce yapılması gerekenler (engelleyici)

Sitede şu an **hiçbir ölçüm kodu yok**. Böyle başlarsan Google hangi tıklamanın kayıtla
sonuçlandığını bilemez; bütçe körlemesine harcanır ve akıllı teklif kullanılamaz.

Ayrıca çerez politikamız (`/kvkk/cerez-politikasi`) açıkça *"reklam, pazarlama, analitik
çerez kullanılmaz; kullanılırsa açık rıza alınır"* diyor. Google Ads etiketi reklam
çerezi yazar. Bu yüzden sıra şöyle olmalı:

1. **Çerez onay bandı.** "Kabul et / Reddet" seçenekleri eşit görünürlükte olmalı.
   Google Consent Mode v2 ile varsayılan durum *reddedildi* olarak başlar; kullanıcı
   kabul edince reklam çerezleri açılır.
2. **Google etiketi (gtag.js).** Ads dönüşüm kimliği (`AW-…`) ortam değişkeninden okunur.
   Kimlik tanımlı değilse hiçbir şey yüklenmez.
3. **Dönüşüm olayları** (bkz. bölüm 5).
4. **Yasal metinlerin güncellenmesi:** çerez politikasına reklam çerezleri tablosu,
   aydınlatma metnine ve alt işleyenler listesine (`src/lib/constants/legal.ts`) Google
   eklenir.

Bu dört madde kod işidir; ben yapabilirim. Senden yalnızca Google Ads hesabındaki
**dönüşüm kimliği ve etiketleri** lazım (bölüm 5'te nasıl alınacağı yazıyor).

---

## 1. Hedef ve strateji

- **Hedef:** Saha ekibi olan firmaların **firma kurup 48 saatlik denemeyi başlatması**.
  Ödeme EFT ile ve panel dışında alındığı için ilk aşamada ölçülebilen en değerli
  adım budur.
- **Kanal:** Yalnızca **Arama ağı**. Görüntülü reklam ağı, YouTube ve Performance Max
  ilk aşamada kullanılmaz. Bu ürünü arayan kişi niyetini aramayla belli eder; görsel
  ağlar dönüşüm verisi birikmeden bütçeyi dağıtır.
- **Yaklaşım:** Dar ve yüksek niyetli kelimelerle başla ("hakediş programı", "şantiye
  yönetim programı"). Arama terimleri raporuna göre genişlet.

### Neden bu kelimeler?

| Öncelik | Tema | Neden |
|---|---|---|
| 1 | Hakediş | Ürünün en güçlü ve en ayırt edici özelliği. Arayan kişi doğrudan ödeme yapan firma sahibi ya da müdür |
| 1 | Şantiye / saha yönetim programı | Genel ama yüksek niyetli. Ana sayfa bütün modülleri anlatıyor |
| 2 | Günlük iş planı ve imalat | WhatsApp paylaşımı ve "İş Planından Doldur" rakiplerden ayırıyor |
| 2 | Puantaj | Arama hacmi yüksek ama bordro ve PDKS arayanlarla karışıyor; negatiflerle süzülmeli |
| 3 | Malzeme ve depo, araç ve ekipman, proje ve metraj | Daha dar kitle; destekleyici gruplar |

---

## 2. Kampanya yapısı

```
MK OPS | Marka                    (bütçenin ~%5'i)
  └─ Marka                        → /
MK OPS | Arama | Ana              (bütçenin ~%65'i)
  ├─ Şantiye ve Saha Yönetimi     → /
  ├─ Hakediş                      → /cozumler/hakedis-takibi
  ├─ Günlük İş Planı ve İmalat    → /cozumler/gunluk-is-takibi
  └─ Proje ve Metraj              → /cozumler/proje-metraj-takibi
MK OPS | Arama | Modüller         (bütçenin ~%30'u)
  ├─ Puantaj                      → /cozumler/puantaj-personel-takibi
  ├─ Malzeme ve Depo              → /cozumler/irsaliye-malzeme-takibi
  └─ Araç ve Ekipman              → /cozumler/arac-ekipman-takibi
```

**Neden iki ayrı arama kampanyası?** Puantaj ve stok gibi kelimeler hacimli ve ucuz
tıklama getirir. Aynı kampanyada olursa bütçenin çoğunu yer, hakediş gibi değerli
kelimeler gösterim alamaz. Ayırınca her biri kendi bütçesiyle döner.

Her reklam grubunda **1 duyarlı arama reklamı** var: 10–15 başlık, 4 açıklama. İki
haftalık veriden sonra en zayıf grubun reklamına ikinci bir varyant eklenebilir.

---

## 3. Kampanya ayarları

| Ayar | Değer | Not |
|---|---|---|
| Kampanya türü | Arama | Hedef: "Potansiyel müşteriler" ya da hedefsiz |
| Ağlar | Yalnızca Google Arama | **Arama Ağı iş ortakları** ve **Görüntülü Reklam Ağı** işaretini kaldır |
| Konum | Türkiye | Konum seçeneği: **"Varlık: Hedeflenen konumlarda bulunan veya düzenli olarak bulunan kişiler"**. "İlgi gösteren" seçeneği yurt dışından boş tıklama getirir |
| Dil | Türkçe | |
| Kitle segmentleri | Yok (gözlem modunda eklenebilir) | |
| Zaman planlaması | Tüm gün | 2 haftalık veriyle saat ve gün bazında düzelt |
| Cihaz | Hepsi | Kayıt telefondan da yapılabiliyor |
| Otomatik etiketleme | **Açık** | GCLID için gerekli; UTM eklemeye gerek yok |
| Teklif (ilk 2–4 hafta) | **Tıklamaları en üst düzeye çıkar** + en yüksek TBM sınırı | Dönüşüm verisi yokken |
| Teklif (sonra) | **Dönüşümleri en üst düzeye çıkar** → sonra **Hedef EBM** | Son 30 günde en az 15–30 dönüşüm olunca |
| Marka kampanyası teklifi | Hedef gösterim payı, %90, "Arama sonuçları sayfasının üst kısmı" | Ucuz ve korur |
| Otomatik öneriler | "Otomatik olarak uygulanan öneriler"in **hepsini kapat** | Özellikle "geniş eşleme ekle" ve "anahtar kelime ekle" |

### Bütçe

Bütçeyi sen belirleyeceksin. Hesaplamak için:

1. Google Ads → **Araçlar → Anahtar Kelime Planlayıcısı**'na `anahtar-kelimeler.csv`'deki
   kelimeleri ver. "Sayfanın üst kısmı için teklif (yüksek aralık)" değerini not et.
2. **Günlük bütçe ≈ ortalama TBM × günde istediğin tıklama sayısı.**
   Test için günde **30–50 tıklama** makul bir başlangıç.
3. Bu yazılım türünde kayıt oranı genelde düşük olur; %3–8 aralığı tahmindir, garanti
   değil. 4 haftalık testte en az **20–30 deneme kaydı** alacak bir bütçe, karar vermek
   için yeterli veri sağlar.

---

## 4. Anahtar kelimeler ve negatifler

- **Eşleme türü:** Başlangıçta yalnızca **sıralı ifade** (`"…"`) ve **tam eşleme**
  (`[…]`). Geniş eşleme, akıllı teklif ve en az 30 dönüşüm geldikten sonra denenir.
- **Negatif liste:** `negatif-kelimeler.txt` dosyasını Google Ads → **Araçlar → Paylaşılan
  kitaplık → Hariç tutulan anahtar kelime listeleri** altında "MK OPS Ortak Negatif" adıyla
  oluştur ve üç kampanyaya da bağla. (Marka kampanyasına bağlamak zararsız.)

### Negatif listede özellikle dikkat edilenler

Bu kelimelerin arayanları başka bir ürün istiyor. Tıklarlarsa deneme açar, aradığını
bulamaz ve hem para hem de güven kaybedilir:

| Grup | Neden negatif |
|---|---|
| Fiyat farkı, EKAP, yaklaşık maliyet, keşif, poz | Kamu ihalesi hakediş programı arıyorlar. MK OPS bu hesapları yapmıyor |
| AutoCAD, çizim, metraj hesaplama | Çizimden metraj çıkaran CAD aracı arıyorlar |
| GPS, uydu, anlık konum | Araç takip cihazı arıyorlar. MK OPS'ta konum takibi yok |
| Bordro, SGK, PDKS, parmak izi | Maaş hesaplama ya da kartlı giriş sistemi arıyorlar |
| Market, barkod, e-ticaret | Perakende stok programı arıyorlar |
| İş ilanı, nedir, örnek, indir, şablon | İş arayan, öğrenci ya da bedava Excel şablonu arayan |

---

## 5. Dönüşüm izleme

### Dönüşüm işlemleri

| Dönüşüm | Ne zaman tetiklenir | Tür | Değer |
|---|---|---|---|
| **Firma kuruldu** | Onboarding'de "Yeni şirket kur" başarılı olunca | **Birincil** (teklif buna göre yapılır) | Sabit, ör. 1 |
| Kayıt oldu | `/register` formunda kayıt başarılı olunca | İkincil (yalnızca gözlem) | — |
| WhatsApp tıklaması | Sitedeki WhatsApp düğmeleri | İkincil | — |
| Teklif Al tıklaması | Fiyat bölümündeki "Teklif Al" | İkincil | — |

**"Kayıt oldu" neden birincil değil?** Kayıttan sonra e-posta doğrulaması ve firma
kurma adımı var. Bu adımlarda kaybolan kişiler gerçek müşteri değil. Google'a "firma
kuranı getir" demek daha doğru kişileri getirir.

### Senden gerekenler

1. Google Ads → **Hedefler → Dönüşümler → Yeni dönüşüm işlemi → Web sitesi**.
2. `www.mk-ops.tr` adresini gir, **"Manuel olarak kod kullanarak"** kurulumu seç.
3. Yukarıdaki 4 dönüşümü oluştur. Her biri için **dönüşüm kimliği** (`AW-123456789`)
   ve **dönüşüm etiketi** (`AbC-dEfGhIj`) verilir. Kimlik hepsinde aynıdır, etiket farklıdır.
4. Bunları bana ver; ben de Vercel'de tanımlanacak ortam değişkeni adlarını söyleyeyim.

### Sonraki aşama: ödeme yapan firmayı ölçmek

En değerli olay **ödeme yapan firma**. Ödeme EFT ile ve süper admin plan atayarak
gerçekleştiği için tarayıcıdan ölçülemez. Çözüm şu:

- Firma kurulurken reklam tıklamasının kimliği (**GCLID**) firma kaydına yazılır
  (yalnızca çerez onayı verilmişse).
- Süper admin plan atadığında bu firma "satın aldı" dönüşümü olarak dışa aktarılır ve
  Google Ads'e **çevrimdışı dönüşüm** olarak yüklenir. Aylık bir CSV yeterli.

Böylece Google, yalnızca deneme açanları değil **parayı ödeyenleri** getirmeyi öğrenir.
Bunu ilk kurulumdan 1–2 ay sonra, yeterli satış olduğunda yapmak mantıklı.

---

## 6. Öğeler (eski adıyla uzantılar)

Hepsi `REKLAM-METINLERI.md` dosyasında hazır. Kampanya düzeyinde (üç arama kampanyasına) ekle:

- **Site bağlantıları (7):** Hakediş, İş Planı, Puantaj, Malzeme, Araç, Ücretsiz Dene, Kılavuz
- **Açıklama metinleri (10):** 48 saat ücretsiz, kredi kartı gerekmez, kurulum yok…
- **Yapılandırılmış snippet:** "Hizmet kataloğu" başlığıyla 6 modül
- **Logo ve işletme adı:** "MK OPS" ve kare logo (Google'ın onayından geçer)
- **Arama öğesi (isteğe bağlı):** +90 545 659 75 51. Bu numara aranınca açılıyorsa
  ekle; yalnızca WhatsApp'ta kullanılıyorsa ekleme.

---

## 7. Kurulum adımları (sırayla)

1. [ ] Çerez onay bandı, Google etiketi ve dönüşüm olayları koda eklenir; yasal metinler
       güncellenir (**kod tarafı, ben**).
2. [ ] Google Ads hesabı açılır. "Akıllı kampanya" sihirbazını atlamak için
       **"Uzman moduna geç"** seçilir. Fatura bilgileri girilir.
3. [ ] Dönüşüm işlemleri oluşturulur, kimlik ve etiketler bana iletilir.
4. [ ] Google Ads Editor kurulur, hesap indirilir.
5. [ ] Editor'da üç kampanya, bölüm 3'teki ayarlarla elle oluşturulur. Kampanya adları
       CSV'lerdekiyle **birebir aynı** olmalı.
6. [ ] **Hesap → İçe aktar → Dosyadan** ile önce `anahtar-kelimeler.csv`, sonra
       `reklamlar.csv` içe aktarılır. Reklam grupları otomatik oluşur. Sütun eşleme
       ekranında eşleşmeleri kontrol et.
7. [ ] Negatif liste paylaşılan kitaplıkta oluşturulup kampanyalara bağlanır.
8. [ ] Öğeler (site bağlantısı, açıklama metni, snippet, logo) eklenir.
9. [ ] Değişiklikler gönderilir. Reklamlar 1 iş günü içinde incelemeden geçer.
10. [ ] **Google Etiket Yardımcısı** ile sitede test kaydı yapılıp dönüşümün geldiği
        doğrulanır. Test firması sonra süper admin panelinden silinir.

---

## 8. Haftalık bakım rutini (her pazartesi ~20 dakika)

1. **Arama terimleri raporu** (Anahtar kelimeler → Arama terimleri): ilgisiz terimleri
   negatif listeye ekle. İlk iki hafta bunu **her gün** yap; en çok para burada kaçar.
2. **Harcayıp dönüşüm getirmeyen kelimeler:** bir kelime, hedef EBM'nin 2 katı kadar
   harcayıp hiç dönüşüm getirmediyse duraklat.
3. **Reklam öğesi performansı:** "Düşük" etiketli başlıkları yenileriyle değiştir.
   `uret.mjs`'de düzenle, yeniden üret, Editor'a aktar.
4. **Arama gösterim payı:** "Bütçe nedeniyle kaybedilen" oranı yüksekse ve EBM iyiyse
   bütçeyi artır.
5. **Yeni kayıtları takip et:** süper admin panelinde son hafta kurulan firmalar.
   48 saat kısa bir süre; deneme bitmeden WhatsApp'tan ulaşıp yardım teklif etmek iyi olur.

### İzlenecek göstergeler

| Gösterge | Ne anlatır |
|---|---|
| TO (tıklama oranı) | Reklam metni ile arama ne kadar uyuşuyor. Düşükse metin ya da kelime zayıf demektir |
| TBM | Tıklama başına maliyet |
| Dönüşüm oranı | Hedef sayfanın ikna gücü |
| **Firma kurma başına maliyet** | Asıl ölçü |
| **Ödeyen firma başına maliyet** | Çevrimdışı dönüşüm kurulunca. Firmanın plan geliriyle (1, 3 veya 6 aylık) kıyasla |

---

## 9. Hedef sayfa önerileri (isteğe bağlı, sonra)

- `/cozumler/*` sayfalarının üstünde **"48 Saat Ücretsiz Dene"** düğmesinin ilk ekranda
  görünür olduğundan emin ol. Reklamdan gelen kişi kaydırmadan düğmeyi görmeli.
- Kayıt formu kısa tutulmalı. Şu an e-posta doğrulaması ve firma kurma adımı var;
  bu adımlardaki kaybı dönüşüm verisinden izle.
- Reklam başlığı ile sayfa başlığının uyuşması kalite puanını yükseltir. Ör. "Hakediş
  Takip Programı" reklamı, "Hakediş Takibi ve Raporlama Programı" sayfasına gider.
