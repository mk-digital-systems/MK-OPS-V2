import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, CheckCircle2, ClipboardCheck, HardHat, Package, ReceiptText, Users } from "lucide-react";
import { APP_NAME, SITE_URL } from "@/lib/constants/brand";
import { Button } from "@/components/ui/button";
import { ConnectedSystemMap } from "@/components/marketing/connected-system-map";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { PanelScreenshot } from "@/components/marketing/panel-screenshot";

export const metadata: Metadata = {
  title: "Şantiye Takip Programı | A'dan Z'ye Bağlı Saha Yönetimi",
  description: "Şantiye takip programı ile iş planı, imalat, hakediş, puantaj, taşeron, depo ve araç kayıtlarını tek veri akışında yönetin.",
  alternates: { canonical: "/santiye-takip-programi" },
};

const FLOW = [
  { icon: CalendarDays, title: "Plan", text: "Ekip, araç ve proje sabah tek planda eşleşir.", href: "/cozumler/gunluk-is-takibi" },
  { icon: HardHat, title: "İmalat", text: "Akşam yalnızca yapılan kalem ve miktar girilir.", href: "/cozumler/gunluk-is-takibi" },
  { icon: ReceiptText, title: "Hakediş", text: "Miktar kayıt günündeki fiyatla parasal değere dönüşür.", href: "/cozumler/hakedis-takibi" },
  { icon: Users, title: "Puantaj", text: "Personelin çalışması, izni ve şube günleri ay boyunca birikir.", href: "/cozumler/puantaj-personel-takibi" },
  { icon: ClipboardCheck, title: "Onay", text: "Şube kaydeder; Merkez yetkisiyle kontrol ve onay ilerler.", href: "/cok-subeli-santiye-yonetimi" },
  { icon: Package, title: "Stok", text: "İrsaliye depoya, sevkiyat hedef depoya, çıkış projeye bağlanır.", href: "/cozumler/irsaliye-malzeme-takibi" },
];

const faq = [
  ["Şantiye takip programı hangi işleri kapsar?", "Günlük iş planı, proje ve metraj, imalat, hakediş, personel ve puantaj, taşeron, malzeme-depo, araç-yakıt ve ekipman zimmeti aynı panelde çalışır."],
  ["Saha ekibinin uygulama kullanması gerekir mi?", "Hayır. Ofis veya şube yöneticisi kayıtları girebilir; günlük plan ekiplere WhatsApp için hazırlanmış metin ya da görsel olarak gönderilebilir."],
  ["Birden fazla şantiye ayrı izlenebilir mi?", "Evet. Şubeler ve şantiyeler yetki kapsamlarıyla ayrılır; firma yöneticisi erişebildiği tüm şubeleri tek görünümden izleyebilir."],
];

export default function ConstructionTrackingPage() {
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: APP_NAME, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: `${SITE_URL}/santiye-takip-programi`, description: metadata.description },
    { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ] };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="overflow-hidden border-b bg-[radial-gradient(circle_at_80%_0%,#dbeafe,transparent_34%)] dark:bg-[radial-gradient(circle_at_80%_0%,#1e3a8a66,transparent_34%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-primary">Şantiye takip programı</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Sahadaki ilk kayıttan Merkez&apos;deki sonuca kadar</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{APP_NAME}, şantiye yönetimini ayrı ayrı ekranların toplamı olmaktan çıkarır. Plan imalata, imalat hakedişe, personel puantaja, irsaliye depo ve proje çıkışına bağlanır.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/register">48 saat ücretsiz deneyin <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="#akisin-tamami">A&apos;dan Z&apos;ye akışı görün</Link></Button>
            </div>
          </div>
          <PanelScreenshot src="/images/panel/dash.png" alt="Şantiye takip programı genel bakış ve hakediş ekranı" caption="Firma yöneticisinin projeleri, hakedişi ve yaklaşan tarihleri gördüğü ana ekran." priority />
        </div>
      </section>

      <section id="akisin-tamami" className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.16em] text-primary">A&apos;dan Z&apos;ye iş akışı</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Aynı bilgi ikinci kez yazılmaz</h2><p className="mt-3 text-muted-foreground">Her adım bir sonrakinin girdisini hazırlar. Böylece saha ile ofis aynı kaydın farklı sonucunu görür.</p></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FLOW.map((item, index) => <Link key={item.title} href={item.href} className="group rounded-2xl border bg-card p-5 hover:border-primary"><div className="flex items-center justify-between"><item.icon className="h-5 w-5 text-primary" /><span className="text-xs text-muted-foreground">0{index + 1}</span></div><h3 className="mt-6 font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">Detayı açın <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span></Link>)}
          </div>
          <div className="mt-12"><ConnectedSystemMap /></div>
        </div>
      </section>

      <section className="border-y bg-muted/30 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2">
          <div><p className="text-sm font-semibold text-primary">Tek şantiyeden çok şubeli yapıya</p><h2 className="mt-2 text-3xl font-semibold">Büyüdükçe dosya sayısı değil, görünürlük artsın</h2><p className="mt-4 leading-7 text-muted-foreground">Şantiye ve şubeler kendi günlük işini yürütür. Merkez, yetkisi olan tüm şubelerin planını, puantaj onayını, malzeme hareketini ve hakedişini tek hesaptan izler.</p><Link href="/cok-subeli-santiye-yonetimi" className="mt-5 inline-flex items-center gap-2 font-medium text-primary">Çok şubeli yapıyı inceleyin <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="grid gap-3 sm:grid-cols-2">{[[Building2,"Şube bazlı yetki"],[Users,"Personel şube geçmişi"],[Package,"Çoklu depo"],[CheckCircle2,"Merkez onayı"]].map(([Icon,title]) => { const I=Icon as typeof Building2; return <div key={String(title)} className="rounded-2xl border bg-card p-5"><I className="h-5 w-5 text-primary"/><p className="mt-4 font-semibold">{String(title)}</p></div>; })}</div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16"><h2 className="text-3xl font-semibold">Sık sorulan sorular</h2><div className="mt-6 grid gap-3 md:grid-cols-3">{faq.map(([q,a]) => <details key={q} className="rounded-2xl border bg-card p-5"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p></details>)}</div><div className="mt-12"><MarketingCta /></div></section>
    </article>
  );
}
