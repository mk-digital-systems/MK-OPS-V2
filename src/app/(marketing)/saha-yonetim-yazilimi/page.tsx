import type { Metadata } from "next";
import { LandingPage, type LandingContent } from "@/components/marketing/landing-page";

const content: LandingContent = {
  path: "/saha-yonetim-yazilimi",
  eyebrow: "Saha yönetim yazılımı",
  h1: "Saha yönetim yazılımı: ekip, araç ve işi sahada ilk günden bağlayın",
  lead: "Sahada ekibi, aracı ve ekipmanı olan firmalar için günlük operasyonu planlayan, imalatı kaydeden ve sonucu hakediş ile puantaja bağlayan saha operasyon yönetim programı.",
  description: "Saha yönetim yazılımı: ekip ve araç planı, çakışma kontrolü, günlük imalat raporu, ekipman zimmeti ve WhatsApp paylaşımı. Kurulumsuz, mobil uyumlu; 48 saat ücretsiz deneyin.",
  screenshot: { src: "/images/panel/plan.png", alt: "MK OPS saha yönetim yazılımı günlük iş planı ekranı", caption: "Ekip, personel, araç ve proje günlük planda eşleşir." },
  sections: [
    {
      title: "Sabah plan, akşam rapor",
      text: "Saha operasyonu her gün aynı döngüyle işler: kim nerede çalışacak, ne yapıldı, kayıtlara ne işlendi. MK OPS bu döngüyü tek kayıtta tutar.",
      bullets: [
        "Ekipler proje, ekip türü, ekip şefi ve personelle kurulur; araç atamak isteğe bağlıdır",
        "Aynı kişi veya araç aynı gün iki ekibe yazılamaz (çakışma kontrolü)",
        "İzinli ve raporlu personel ayrıca işaretlenir; plan taslak olarak saklanabilir",
        "Plan, firma logolu görsel veya düz metin olarak WhatsApp'tan paylaşılır",
      ],
    },
    {
      title: "Saha kaydı ofis kaydıyla aynıdır",
      text: "İmalat raporu girildiğinde proje ilerlemesi ve hakediş kendiliğinden güncellenir; ofis aynı bilgiyi ikinci kez yazmaz.",
      bullets: [
        "\"İş planından doldur\" ile günün ekipleri forma hazır gelir; yalnızca miktar girilir",
        "Günlük rapor firma logolu PDF olarak paylaşılır",
        "Düzenlenen veya silinen imalat projeye geri yansır",
        "Geçmiş planlar ve imalatlar tarih, proje, plaka veya personele göre aranır",
      ],
    },
    {
      title: "Araç, yakıt ve ekipman sahada kimde?",
      text: "Sahadaki kaynaklar kaybolduğunda iş durur. Araç, yakıt ve ekipman kayıtları işin kendisiyle bağlantılıdır.",
      bullets: [
        "Araç kartı: muayene ve sigorta tarihi, 15 gün kala bildirim",
        "Yakıt: tarih, kilometre ve litre; aylık döküm",
        "Ekipman zimmeti: araca, personele veya ekibe zimmet, aktarım ve depoya iade",
        "Her hareket kim ve ne zaman bilgisiyle kayıtlıdır",
      ],
    },
  ],
  note: {
    title: "Saha ekibi uygulama kullanmak zorunda değil",
    text: "Kayıtları ofis ya da şube yöneticisi girebilir; günlük plan ekiplere WhatsApp için hazırlanmış metin veya görsel olarak gönderilir. Arayüz mobil uyumludur.",
  },
  related: [
    { href: "/cozumler/gunluk-is-takibi", label: "Günlük iş planı ve imalat", text: "Plan, imalat raporu ve geçmişin ayrıntıları." },
    { href: "/cozumler/arac-ekipman-takibi", label: "Araç, yakıt ve ekipman", text: "Tarih uyarıları, yakıt dökümü ve zimmet." },
    { href: "/santiye-yonetim-sistemi", label: "Şantiye yönetim sistemi", text: "Şube, rol ve yetki düzeniyle bütün resim." },
  ],
  faq: [
    ["Saha yönetim yazılımı ile şantiye yönetimi arasındaki fark nedir?", "Saha yönetimi günlük ekip ve kaynak planına, şantiye yönetimi ise proje, hakediş ve firma düzenine daha geniş bakar. MK OPS ikisini aynı kayıtta toplar."],
    ["Hangi saha işleri için uygundur?", "İnşaat, altyapı, doğalgaz, elektrik, fiber/telekom, servis ve montaj gibi ekip ve metraj ile çalışan işler."],
    ["Telefonda kullanılır mı?", "Evet, mobil uyumlu web arayüzüyle telefon, tablet ve bilgisayardan kullanılır."],
    ["Deneme var mı?", "48 saat ücretsiz, kredi kartı gerekmez."],
  ],
};

export const metadata: Metadata = {
  title: "Saha Yönetim Yazılımı | Ekip, Araç, İmalat ve Zimmet",
  description: content.description,
  alternates: { canonical: content.path },
};

export default function FieldManagementSoftwarePage() {
  return <LandingPage c={content} />;
}
