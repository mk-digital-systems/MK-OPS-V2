import type { Metadata } from "next";
import { LandingPage, type LandingContent } from "@/components/marketing/landing-page";

const content: LandingContent = {
  path: "/santiye-raporlama-programi",
  eyebrow: "Şantiye raporlama programı",
  h1: "Şantiye raporlama programı: raporlar kayıtlardan kendiliğinden çıksın",
  lead: "Hakediş, puantaj, günlük imalat, stok ve zimmet raporları ayrı tablolarda yeniden yazılmaz. MK OPS'ta rapor, sahadan girilen kaydın çıktısıdır; firma logolu PDF, Excel ve Word olarak alınır.",
  description: "Şantiye raporlama programı: hakediş dönem raporu, puantaj, günlük imalat, stok ve zimmet çıktıları firma logolu PDF, Excel ve Word. Kayıttan rapora, ikinci kez yazmadan.",
  screenshot: { src: "/images/panel/puantaj-cikti.png", alt: "MK OPS şantiye raporlama puantaj çıktısı", caption: "Aylık puantaj çıktısı firma adı ve logosuyla hazırlanır." },
  sections: [
    {
      title: "Hangi raporlar alınır?",
      text: "Raporların kaynağı ayrı bir hazırlık değil, günlük kayıtlardır. Kayıt girildikçe rapor güncel kalır.",
      bullets: [
        "Hakediş dönem raporu: proje, iş kalemi ve ekip şefi bazında döküm; PDF ve çok sayfalı Excel",
        "Aylık puantaj Excel ve Word; kişi bazında puantaj",
        "Günlük imalat raporu PDF; geçmiş imalatlar tarih aralığı ve ekip başına göre",
        "Stok listesi Excel ve PDF; her depo ayrı sütunda",
        "Araç ekipman listesi Word; günlük iş planı görsel veya metin",
        "Telekom projelerinde tarih aralıklı HP (home pass) raporu",
      ],
    },
    {
      title: "Yönetici ne görür?",
      text: "Raporların yanında panel, yöneticinin günü açmadan durumu anlaması için hazırlanır.",
      bullets: [
        "Gösterge paneli: proje durumları, hakediş özeti, araç tarih uyarıları",
        "Bildirimler: geciken veya 3 gün içinde bitecek projeler, fiyatsız hakediş kayıtları",
        "Genel arama: aktif ve arşivdeki tüm projelerde",
        "İşlem geçmişi: önceki ve sonraki değerleriyle; kayıtlar değiştirilemez ve silinemez",
      ],
    },
    {
      title: "Güvenilir rapor için kayıt disiplini",
      text: "Rapor doğruluğu girişteki doğruluktan gelir. Bu yüzden fiyat sabitleme, çakışma kontrolü ve yetki kuralları kayıt anında çalışır.",
      bullets: [
        "Her iş kaydı girildiği günkü fiyatla sabitlenir; geçmiş hakediş sonradan değişmez",
        "Birim fiyat ve tutarlar yalnızca hakediş yetkisi olanlarca görülür",
        "Puantaj ve stok değişikliklerinin kendi geçmişi tutulur",
        "Firma logosu ve adı bütün çıktılarda otomatik yer alır",
      ],
    },
  ],
  related: [
    { href: "/cozumler/hakedis-takibi", label: "Hakediş takibi", text: "Dönem raporu ve fiyat sabitleme." },
    { href: "/cozumler/puantaj-personel-takibi", label: "Puantaj ve personel", text: "Aylık tablo ve Excel/Word çıktıları." },
    { href: "/cozumler/denetim-gunlugu", label: "Denetim günlüğü", text: "Kim, ne zaman, neyi değiştirdi." },
  ],
  faq: [
    ["Raporlar hangi formatlarda alınır?", "Rapora göre PDF, Excel veya Word; görsel çıktı iş planı için de vardır."],
    ["Çıktılarda firma logosu olur mu?", "Evet, firma adı ve logosu çıktılarda yer alır."],
    ["Raporu özelleştirebilir miyim?", "Bu sayfada anlatılan hazır çıktılar vardır; kendi rapor tasarımınız için bizimle iletişime geçin."],
    ["Deneme var mı?", "48 saat ücretsiz, kredi kartı gerekmez."],
  ],
};

export const metadata: Metadata = {
  title: "Şantiye Raporlama Programı | Hakediş, Puantaj ve İmalat Raporu",
  description: content.description,
  alternates: { canonical: content.path },
};

export default function ConstructionReportingPage() {
  return <LandingPage c={content} />;
}
