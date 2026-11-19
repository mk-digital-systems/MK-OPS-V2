import type { Metadata } from "next";
import { LandingPage, type LandingContent } from "@/components/marketing/landing-page";

const content: LandingContent = {
  path: "/santiye-yonetim-sistemi",
  eyebrow: "Şantiye yönetim sistemi",
  h1: "Şantiye yönetim sistemi: firma, şube ve şantiyeleri tek çatıdan yönetin",
  lead: "MK OPS; proje, günlük iş planı, imalat, hakediş, personel, taşeron, depo ve araç kayıtlarını tek firma hesabında toplayan, bulut tabanlı bir şantiye yönetim sistemidir. Kurulum yoktur; tarayıcıdan, internet olan her yerden çalışır.",
  description: "Bulut tabanlı şantiye yönetim sistemi: şube ve şantiye yetkileri, rol bazlı erişim, hakediş, puantaj, taşeron, depo ve araç kayıtları tek firma hesabında. 48 saat ücretsiz deneyin.",
  screenshot: { src: "/images/panel/proje.png", alt: "MK OPS şantiye yönetim sistemi proje ve ilerleme ekranı", caption: "Projeler, ilerleme ve sorumlu ekipler aynı panelde." },
  sections: [
    {
      title: "Şantiye yönetim sistemi neyi yönetir?",
      text: "Şantiye yönetimi tek bir ekran değil, birbirine bağlı kayıtlar zinciridir. MK OPS bu zinciri tek veri akışında tutar: sabah yazılan plan akşam imalata, imalat hakedişe, personel kaydı puantaja dönüşür.",
      bullets: [
        "Proje, poz listesi ve metraj; ilerleme yüzdesi otomatik hesaplanır",
        "Günlük iş planı ve imalat raporu; aynı kişi veya araç iki ekibe yazılamaz",
        "Hakediş: miktar × birim fiyat, dönem raporu PDF ve Excel",
        "Personel, aylık puantaj ve avans; Excel ve Word çıktıları",
        "Taşeron ekstresi, malzeme/depo/irsaliye, araç, yakıt ve ekipman zimmeti",
        "İşlem geçmişi: kim, ne zaman, hangi kaydı değiştirdi",
      ],
    },
    {
      title: "Birden fazla şantiye ve şube için yetki düzeni",
      text: "Yönetim sistemi olmanın ölçüsü, doğru kişinin doğru veriyi görmesidir. Firma yöneticisi tüm şubeleri tek görünümden izler; diğer kullanıcılar yalnızca yetkili oldukları modül ve şubeleri görür.",
      bullets: [
        "Ana yönetici, yönetici ve muhasebe rolleri; modül bazında ayrı yetki",
        "Onaysız erişim yok: katılım isteği ana yönetici onaylayana kadar veri görünmez",
        "Birim fiyat ve tutarlar yalnızca hakediş yetkisi olanlara açık",
        "Her firmanın verisi veritabanı seviyesinde ayrılır",
      ],
    },
    {
      title: "Hangi firmalar kullanır?",
      text: "Program sektörden bağımsızdır; iş türleri, iş kalemleri ve malzeme kategorileri firmanın kendi işine göre tanımlanır.",
      bullets: [
        "Bina ve inşaat müteahhitleri",
        "Altyapı, doğalgaz ve elektrik taşeronları",
        "Fiber / telekom hat işi yapan firmalar",
        "Metraj üzerinden çalışan servis, bakım ve montaj firmaları",
      ],
    },
  ],
  note: {
    title: "Türkiye genelinde kullanılabilir",
    text: "MK OPS bulut tabanlı bir web uygulamasıdır; belirli bir ile bağlı değildir. İnternet erişimi olan her şantiyede, telefon, tablet veya bilgisayarın tarayıcısından kullanılır. Yerinde kurulum ya da il bazlı ayrı bir yazılım sürümü yoktur.",
  },
  related: [
    { href: "/santiye-takip-programi", label: "Şantiye takip programı", text: "Planlamadan hakedişe A'dan Z'ye iş akışının adım adım anlatımı." },
    { href: "/cok-subeli-santiye-yonetimi", label: "Çok şubeli yönetim", text: "Şube kayıt girer, Merkez onaylar; şantiye bazlı yetkilendirme." },
    { href: "/cozumler/hakedis-takibi", label: "Hakediş takibi", text: "Sahadan gelen metraj kayıt günündeki fiyatla hakedişe dönüşür." },
  ],
  faq: [
    ["Şantiye yönetim sistemi ile şantiye takip programı aynı şey mi?", "MK OPS'ta ikisi aynı ürünün iki anlatımıdır: bu sayfa firma, şube ve yetki düzenine; şantiye takip programı sayfası günlük iş akışına odaklanır."],
    ["Kurulum gerekiyor mu?", "Hayır. Tarayıcıdan çalışır; firmanızı oluşturup ekibinizi aynı gün ekleyebilirsiniz."],
    ["Deneme var mı?", "Evet. Bütün modüller 48 saat ücretsiz açıktır; kredi kartı gerekmez."],
    ["Sadece belirli bir ilde mi çalışır?", "Hayır. Web tabanlıdır ve internet olan her yerden kullanılabilir."],
    ["Fiyat nasıl belirleniyor?", "Güncel paketler ve fiyatlar ana sayfadaki fiyat bölümünde yer alır."],
  ],
};

export const metadata: Metadata = {
  title: "Şantiye Yönetim Sistemi | Bulut Tabanlı, Şube ve Şantiye Yetkili",
  description: content.description,
  alternates: { canonical: content.path },
};

export default function ConstructionManagementSystemPage() {
  return <LandingPage c={content} />;
}
