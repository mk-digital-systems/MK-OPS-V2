import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import { APP_NAME, SITE_URL, whatsappUrl } from "@/lib/constants/brand";
import { SOLUTIONS, getSolution } from "@/lib/constants/solutions";
import { Button } from "@/components/ui/button";
import { PanelScreenshot } from "@/components/marketing/panel-screenshot";

type Params = { params: Promise<{ slug: string }> };

const PAGE_PROOF: Record<string, { src: string; alt: string; caption: string }> = {
  "hakedis-takibi": { src: "/images/panel/dash.png", alt: "Hakediş toplamlarını gösteren MK OPS genel bakış ekranı", caption: "Günlük imalatların parasal karşılığı bugün, bu hafta ve dönem toplamında görünür." },
  "gunluk-is-takibi": { src: "/images/panel/plan.png", alt: "Ekip, araç ve projelerin yer aldığı günlük iş planı ekranı", caption: "Personel, araç, ekip türü ve proje tek günlük planda birleşir." },
  "irsaliye-malzeme-takibi": { src: "/images/panel/stok.png", alt: "Merkez ve saha depolarını gösteren malzeme stok ekranı", caption: "Toplam stok ile Merkez ve saha depolarındaki dağılım aynı satırda izlenir." },
  "proje-metraj-takibi": { src: "/images/panel/proje.png", alt: "Proje ilerleme ve metraj takip ekranı", caption: "İş kalemleri ilerledikçe projenin tamamlanma oranı güncellenir." },
  "puantaj-personel-takibi": { src: "/images/panel/puantaj.png", alt: "Aylık personel puantaj takip tablosu", caption: "Çalışma, izin, rapor ve hafta tatili günleri ay boyunca tek tabloda." },
  "arac-ekipman-takibi": { src: "/images/panel/zimmet.png", alt: "Araç ve personele ekipman zimmetleme ekranı", caption: "Ekipmanın depodan araca veya personele uzanan zimmet geçmişi kayıt altında." },
  "denetim-gunlugu": { src: "/images/panel/dash-tall.png", alt: "MK OPS yönetim paneli ve bildirimleri", caption: "Operasyon kayıtları yetki ve işlem geçmişiyle birlikte yönetilir." },
};

const CONNECTIONS: Record<string, { title: string; href: string; text: string }[]> = {
  "hakedis-takibi": [
    { title: "Günlük imalat", href: "/cozumler/gunluk-is-takibi", text: "Girilen miktar hakediş satırını oluşturur." },
    { title: "Proje metrajı", href: "/cozumler/proje-metraj-takibi", text: "Aynı kayıt proje ilerlemesini günceller." },
    { title: "Taşeron ekstresi", href: "/taseron-takibi", text: "Taşerona bağlı ekiplerin payı ayrı izlenir." },
  ],
  "gunluk-is-takibi": [
    { title: "Personel kartı", href: "/cozumler/puantaj-personel-takibi", text: "Plana yalnızca güncel personel gelir." },
    { title: "İmalat ve hakediş", href: "/cozumler/hakedis-takibi", text: "Akşam girilen miktar parasal değere dönüşür." },
    { title: "Araçlar", href: "/cozumler/arac-ekipman-takibi", text: "Araç aynı gün iki ekibe atanamaz." },
  ],
  "irsaliye-malzeme-takibi": [
    { title: "Şube deposu", href: "/cok-subeli-santiye-yonetimi", text: "Giriş hangi şubeye yapıldıysa stok orada artar." },
    { title: "Merkez onayı", href: "/cok-subeli-santiye-yonetimi", text: "Talep ve irsaliye kontrolü onay akışında ilerler." },
    { title: "Proje çıkışı", href: "/cozumler/proje-metraj-takibi", text: "Stoktan düşüm proje ve teslim alanla kaydedilir." },
  ],
  "proje-metraj-takibi": [
    { title: "Günlük imalat", href: "/cozumler/gunluk-is-takibi", text: "Sahadaki miktar ilerleme yüzdesini besler." },
    { title: "Hakediş", href: "/cozumler/hakedis-takibi", text: "Metraj, kayıt tarihindeki fiyatla hesaplanır." },
    { title: "Malzeme çıkışı", href: "/cozumler/irsaliye-malzeme-takibi", text: "Projeye teslim edilen malzeme izlenir." },
  ],
  "puantaj-personel-takibi": [
    { title: "Personel kartı", href: "/cozumler/puantaj-personel-takibi", text: "İşe giriş, görev ve aktiflik bilgisi kaynağıdır." },
    { title: "Şube günleri", href: "/cok-subeli-santiye-yonetimi", text: "Ay içinde hangi şubede kaç gün çalıştığı görünür." },
    { title: "Taşeron kesintisi", href: "/taseron-takibi", text: "Taşeron personeli ve SGK sorumluluğu ayrıştırılır." },
  ],
  "arac-ekipman-takibi": [
    { title: "İş planı", href: "/cozumler/gunluk-is-takibi", text: "Araç günlük ekibe bağlanır." },
    { title: "Şube yakıtı", href: "/santiye-yakit-takibi", text: "Yakıt ve kilometre kayıtları şube bağlamında izlenir." },
    { title: "Zimmet", href: "/cozumler/arac-ekipman-takibi", text: "Ekipman araca, personele veya ekibe aktarılır." },
  ],
  "denetim-gunlugu": [
    { title: "Yetkiler", href: "/cok-subeli-santiye-yonetimi", text: "Kimin hangi şubeyi ve modülü göreceği belirlenir." },
    { title: "Hakediş fiyatları", href: "/cozumler/hakedis-takibi", text: "Fiyat değişiklikleri önceki ve sonraki değerle saklanır." },
    { title: "Stok hareketleri", href: "/cozumler/irsaliye-malzeme-takibi", text: "Hareketi yapan kişi ve zaman bilgisi korunur." },
  ],
};

export function generateStaticParams() {
  return SOLUTIONS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const solution = getSolution((await params).slug);
  if (!solution) return {};
  return {
    title: solution.title,
    description: solution.description,
    alternates: { canonical: `/cozumler/${solution.slug}` },
    // Sayfa openGraph tanımlayınca kökteki ayarlar ve paylaşım görseli devralınmaz; burada yeniden verilir.
    openGraph: {
      title: `${solution.title} — ${APP_NAME}`,
      description: solution.description,
      url: `/cozumler/${solution.slug}`,
      siteName: APP_NAME,
      locale: "tr_TR",
      type: "website",
      images: "/opengraph-image",
    },
  };
}

export default async function SolutionPage({ params }: Params) {
  const solution = getSolution((await params).slug);
  if (!solution) notFound();
  const related = solution.related.map(getSolution).filter((item) => item !== null);
  const proof = PAGE_PROOF[solution.slug];
  const connections = CONNECTIONS[solution.slug] ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: solution.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: APP_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Çözümler", item: `${SITE_URL}/cozumler` },
      { "@type": "ListItem", position: 3, name: solution.shortTitle, item: `${SITE_URL}/cozumler/${solution.slug}` },
    ],
  };

  return (
    <article className="text-[15px] leading-7 text-muted-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav aria-label="Sayfa yolu" className="text-sm">
        <Link href="/cozumler" className="hover:text-foreground">Çözümler</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{solution.shortTitle}</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{solution.title}</h1>
      <p className="mt-4 text-base">{solution.intro}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/register">
            48 saat ücretsiz deneyin
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={whatsappUrl(`${solution.shortTitle} için ${APP_NAME} hakkında bilgi almak istiyorum.`)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" />
            WhatsApp ile sorun
          </a>
        </Button>
      </div>

      {proof ? <div className="mt-10"><PanelScreenshot {...proof} priority /></div> : null}

      <section className="mt-12 rounded-2xl border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold text-foreground">{solution.problem.title}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          {solution.problem.points.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </section>

      {solution.sections.map((section) => (
        <section key={section.title} className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
          <p className="mt-2">{section.text}</p>
          <ul className="mt-3 space-y-2">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Nasıl çalışır?</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-6">
          {solution.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Kimler için?</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          {solution.audience.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      {connections.length > 0 ? (
        <section className="mt-12 rounded-[2rem] bg-slate-950 p-6 text-slate-300 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-300">Bağlı sistem</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Bu modül neye bağlı?</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {connections.map((item) => (
              <Link key={`${item.title}-${item.text}`} href={item.href} className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-sky-400/60">
                <span className="font-semibold text-white">{item.title}</span>
                <span className="mt-2 block text-sm leading-6">{item.text}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Sık sorulan sorular</h2>
        <div className="mt-3 divide-y rounded-2xl border">
          {solution.faq.map((item) => (
            <details key={item.q} className="group p-4">
              <summary className="cursor-pointer list-none font-medium text-foreground marker:hidden">{item.q}</summary>
              <p className="mt-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border bg-primary/5 p-6 text-center">
        <h2 className="text-xl font-semibold text-foreground">{APP_NAME} ile bugün başlayın</h2>
        <p className="mt-2">Kurulum gerekmez; firmanızı kurun, 48 saat bütün modülleri ücretsiz kullanın.</p>
        <Button asChild className="mt-4">
          <Link href="/register">Ücretsiz deneyin</Link>
        </Button>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-foreground">İlgili çözümler</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/cozumler/${item.slug}`} className="block rounded-xl border p-4 hover:border-primary hover:text-foreground">
                  <span className="font-medium text-foreground">{item.shortTitle}</span>
                  <span className="mt-1 line-clamp-2 block text-sm">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
