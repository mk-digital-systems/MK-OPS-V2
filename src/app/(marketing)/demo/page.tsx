import type { Metadata } from "next";
import { LandingPage, type LandingContent } from "@/components/marketing/landing-page";

const content: LandingContent = {
  path: "/demo",
  eyebrow: "MK OPS demo",
  h1: "MK OPS'i kendi iş akışınızla deneyin",
  lead: "Hazır bir demo ortamı yerine kendi firmanızı oluşturup bütün modülleri 48 saat ücretsiz kullanırsınız. Kredi kartı gerekmez; isterseniz önce WhatsApp'tan sorularınızı sorun.",
  description: "MK OPS demo ve deneme: firmanızı oluşturun, bütün modülleri 48 saat ücretsiz kullanın. Kredi kartı gerekmez; veriler deneme sonunda silinmez.",
  screenshot: { src: "/images/panel/dash.png", alt: "MK OPS genel bakış ekranı", caption: "Deneme hesabında bütün modüller açık gelir." },
  primaryCta: { href: "/register", label: "Denemeyi başlatın" },
  sections: [
    {
      title: "İlk 48 saatte ne denemeli?",
      text: "Küçük bir gerçek senaryoyla başlamak en hızlı yoldur.",
      bullets: [
        "Firmanızı kaydedin, logonuzu yükleyin ve iş türlerinizi tanımlayın",
        "Bir proje açın ve poz listenizden birkaç iş kalemi ekleyin",
        "Yarın için bir günlük iş planı kurun ve WhatsApp görseli olarak paylaşın",
        "Günlük imalat girin; ilerleme ve hakedişin güncellendiğini görün",
        "Birkaç personel ekleyip aylık puantaj çıktısı alın",
      ],
    },
    {
      title: "Deneme koşulları",
      text: "Bu sayfada yalnızca ürünün bugün sunduğu deneme koşulları yer alır.",
      bullets: [
        "48 saat ücretsiz; bütün modüller açık",
        "Kredi kartı gerekmez, kurulum yoktur",
        "Deneme veya plan bittiğinde veriler silinmez; plan tanımlandığında kaldığınız yerden devam edersiniz",
        "Destek: panel içi destek talebi, e-posta ve WhatsApp",
      ],
    },
  ],
  note: {
    title: "Fiyat bilgisi",
    text: "Güncel paketler ve fiyatlar ana sayfadaki fiyat bölümünde yer alır. Ödeme EFT/havale iledir.",
  },
  related: [
    { href: "/kilavuz", label: "Kullanım kılavuzu", text: "Modülleri adım adım tanıyın." },
    { href: "/santiye-takip-programi", label: "Şantiye takip programı", text: "A'dan Z'ye iş akışı." },
    { href: "/cozumler", label: "Tüm çözümler", text: "Modül bazında ayrıntılı anlatımlar." },
  ],
  faq: [
    ["Canlı demo görüşmesi alabilir miyim?", "Sorularınız için WhatsApp'tan yazabilirsiniz; ürünü doğrudan deneme hesabınızda görmenizi öneririz."],
    ["Deneme için kredi kartı gerekir mi?", "Hayır."],
    ["Deneme bitince verilerim silinir mi?", "Hayır; plan tanımlandığında kaldığınız yerden devam edersiniz."],
    ["Ekibimi deneme sırasında ekleyebilir miyim?", "Evet; katılım kodunu paylaşın, ana yönetici onayladıkça çalışanlar katılır."],
  ],
  cta: { title: "Denemeyi bugün başlatın", text: "Firmanızı oluşturun, ekibinizi ekleyin; bütün modüller 48 saat açık." },
};

export const metadata: Metadata = {
  title: "MK OPS Demo ve Ücretsiz Deneme | 48 Saat, Kredi Kartı Yok",
  description: content.description,
  alternates: { canonical: content.path },
};

export default function DemoPage() {
  return <LandingPage c={content} />;
}
