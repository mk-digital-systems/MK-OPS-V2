import type { Metadata } from "next";
import { LandingPage, type LandingContent } from "@/components/marketing/landing-page";

const content: LandingContent = {
  path: "/telekom-altyapi-proje-yonetimi",
  eyebrow: "Telekom ve altyapı projeleri",
  h1: "Telekom ve altyapı projeleri için hat, pafta ve metraj takibi",
  lead: "MK OPS, şantiye ve saha operasyon yönetimi programıdır; desteklediği sektörlerden biri de telekom ve altyapıdır. Hat işi yapan firmalar fiber/telekom ve altyapı iş türleriyle projelerini metrajla izler.",
  description: "Telekom ve altyapı projeleri için proje yönetimi: fiber/telekom hattı iş türü, pafta bazında HP takibi, hat kesimi, poz listesi ve hakediş. MK OPS saha operasyon yönetiminin bir kullanım alanı.",
  screenshot: { src: "/images/panel/proje.png", alt: "MK OPS telekom ve altyapı proje takibi ekranı", caption: "Proje, iş kalemi ve ilerleme aynı kayıtta." },
  sections: [
    {
      title: "Hat işi için hazır iş türleri",
      text: "Proje türleri firmanın sektörüne göre kurulumda tanımlanır. Hazır şablonlar arasında Altyapı Hattı, Doğalgaz Hattı, Elektrik Tesisatı ve Fiber/Telekom Hattı bulunur; iş kalemlerini kendi poz listenizde siz yönetirsiniz.",
      bullets: [
        "Metre, adet gibi birimli iş kalemleriyle metraj takibi",
        "Blok, kat, pafta veya hat kesimi gibi bölümlere ayrılan projeler; her bölümün aşaması ayrı izlenir",
        "Poz listesini elle veya Excel'den yükleme; kullanılmayan poz pasife alınır",
        "İlerleme yüzdesi hedef ve yapılan miktardan hesaplanır",
      ],
    },
    {
      title: "Pafta bazında HP takibi",
      text: "Telekom projelerinde pafta bazında HP (home pass) takibi ve tarih aralıklı HP raporu bulunur.",
      bullets: [
        "Pafta bazında kayıt",
        "Tarih aralığına göre HP raporu",
        "Raporlar proje ve ekip kayıtlarıyla aynı veriden gelir",
      ],
    },
    {
      title: "Saha ekibi, taşeron ve hakediş",
      text: "Hat işi çoğunlukla taşeron ekiplerle yürür. Taşeron payı, ödeme ve kesintiler ayrı ekstrede izlenir; hakediş sahadan girilen metrajdan oluşur.",
      bullets: [
        "Günlük iş planı: ekip, personel ve araç eşleşmesi",
        "Taşeron ekstresi: imalat payı, ödeme, avans ve kesintiler",
        "Hakediş = miktar × birim fiyat; dönem raporu PDF ve Excel",
        "Malzeme, depo ve ekipman zimmeti işe bağlı",
      ],
    },
  ],
  note: {
    title: "Kapsam hakkında",
    text: "MK OPS telekom operatör yazılımı veya ağ envanteri çözümü değildir; harita/CBS ve ağ ölçüm cihazı entegrasyonu bu sayfada anlatılan özellikler arasında yer almaz. Ürünün ana konumu şantiye ve saha operasyon yönetimidir; telekom ve altyapı, bu yapıyı kullanan sektörlerden biridir.",
  },
  related: [
    { href: "/cozumler/proje-metraj-takibi", label: "Proje ve metraj takibi", text: "Poz listesi, keşif ve ilerleme." },
    { href: "/taseron-takibi", label: "Taşeron takibi", text: "Ekip, hakediş ve ekstre." },
    { href: "/saha-yonetim-yazilimi", label: "Saha yönetim yazılımı", text: "Günlük plan, imalat ve araç/ekipman." },
  ],
  faq: [
    ["MK OPS bir telekom yazılımı mı?", "Hayır. Şantiye ve saha operasyon yönetimi programıdır; telekom ve altyapı firmaları da kullanabilir."],
    ["Fiber hat işleri için uygun mu?", "Fiber/Telekom Hattı iş türü şablonu, bölümlü proje ve poz listesi ile metraj takibi yapılabilir."],
    ["HP raporu alınır mı?", "Telekom projelerinde pafta bazında HP takibi ve tarih aralıklı HP raporu vardır."],
    ["Deneme var mı?", "48 saat ücretsiz, kredi kartı gerekmez."],
  ],
};

export const metadata: Metadata = {
  title: "Telekom ve Altyapı Proje Yönetimi | Hat, Pafta ve Metraj Takibi",
  description: content.description,
  alternates: { canonical: content.path },
};

export default function TelecomInfrastructurePage() {
  return <LandingPage c={content} />;
}
