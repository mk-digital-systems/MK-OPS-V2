# SEO Güncelleme Raporu — MK OPS (2026-11-19)

## Amaç
Üç siteli marka ayrımında MK OPS'in şantiye ve saha yönetimi sorgularının tek sahibi olması için **hedef sayfa hazırlığı**. MK Digital ve MustafaÖner.net'teki şantiye içeriklerinin ileride yönlendirileceği sayfaları eklemek. Bu aşamada yönlendirme, silme veya canlıya alma yoktur.

## Dal ve commitler
- Dal: `seo/hedef-sayfalar` (PR #5 birleşiminden sonraki güncel `origin/main`'den açıldı; taban `d564227`)
- `9efe5cf` — beş yeni hedef sayfa
- `a16670c` — bölüm genişliklerinin hizalanması (son uygulama commiti)

## Eklenen / değiştirilen sayfalar
- **Yeni (5):** `/santiye-yonetim-sistemi`, `/saha-yonetim-yazilimi`, `/santiye-raporlama-programi`, `/telekom-altyapi-proje-yonetimi`, `/demo`.
- `/telekom-altyapi-proje-yonetimi` MK OPS'in ana kimliği değil, desteklenen sektörlerden biri olarak konumlandı ve kapsam notu içerir. `/santiye-yonetim-sistemi` MK OPS'in bulut tabanlı, il bağımsız kullanılabildiğini anlatır. `/demo` yalnızca gerçek koşulları (48 saat ücretsiz deneme, kredi kartı gerekmez) belirtir.
- İçerik, yalnızca dokümante edilmiş çalışan özelliklerden yazıldı.
- Yeni ortak bileşen: `src/components/marketing/landing-page.tsx`. Değişen mevcut dosya: yalnız `src/app/sitemap.ts` (5 URL eklendi).
- `/fiyatlandirma` oluşturulmadı; fiyat bölümü ana sayfada korundu.

## SEO ve canonical düzenlemeleri
Her sayfada self-canonical (`https://www.mk-ops.tr/...`), benzersiz title/description, WebPage + SoftwareApplication + BreadcrumbList + FAQPage şeması. Sitemap 24 → 29 URL. Mevcut sayfalar, Google Ads iniş sayfaları ve URL'ler değişmedi.

## Build ve test
- `npm run build` başarılı; `tsc --noEmit` temiz.
- ESLint: 0 hata, 11 uyarı (hepsi mevcut `tests/` dosyalarında).
- Bu proje için otomatik tarayıcı testi yok; sayfalar production sunucuda 200, canonical ve sitemap doğrulandı.

## Mobil kontrol
Production sunucuda 390 px ve 1280 px, beş sayfa: yatay taşma yok, bozuk görsel yok, tek H1, ekran görüntüleri incelendi. 1280 px'teki bölüm genişliği hizasızlığı düzeltildi (`a16670c`).

## Yasal sayfalar
**Değiştirilmedi.** `(legal)` rota grubu, KVKK sayfaları ve `legal.ts` dosyasına dokunulmadı; `origin/main`'e göre diff boş. Ortak footer/header/layout değiştirilmedi.

## Yapılmayanlar
Eski URL yönlendirmesi, silme, sitemap temizliği ve production deployment yapılmadı. Takipsiz `GELISTIRME VE HATA AYIKLAMA.md` ve `SONRAKI-CALISMA.md` dosyaları commit edilmedi ve değiştirilmedi.

## Bekleyen işler
1. Mevcut sayfalardan yeni sayfalara iç bağlantılar (ortak footer yasal bağlantılar içerdiğinden ayrı değerlendirilecek).
2. `/fiyatlandirma`: yalnızca güncel ve sürdürülebilir fiyat bilgisi netleşirse.
3. Taşeron, yakıt, karşılaştırma ve şablon sayfalarına yapılandırılmış veri eklenmesi.
4. MK Digital ve MustafaÖner.net eski şantiye sayfalarının yönlendirmesi (hedefler canlıda doğrulandıktan sonra, ayrı onayla).

## Canlıya alma öncesi kontrol listesi
- [ ] Vercel ortamında `NEXT_PUBLIC_SITE_URL` doğru (production https; değer bu raporda yer almaz).
- [ ] Preview'da beş sayfa 200, canonical, sitemap'te, 390 px görünüm.
- [ ] Yasal sayfalar ve Google Ads iniş sayfaları aynı kodu döndürüyor.
- [ ] `main`'e merge ve production deployment için ayrı onay alındı.
