import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Check, Eye, GitBranch, LockKeyhole } from "lucide-react";
import { SITE_URL } from "@/lib/constants/brand";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { PanelScreenshot } from "@/components/marketing/panel-screenshot";

export const metadata: Metadata = {
  title: "Çok Şubeli ve Çok Şantiyeli Firma Yönetimi",
  description: "Şubeler kendi operasyonunu yürütür, Merkez onaylar. Personel şube günleri, depo, puantaj, hakediş ve yetkileri tek panelden yönetin.",
  alternates: { canonical: "/cok-subeli-santiye-yonetimi" },
};

const faq = [
  ["Şube yöneticisi diğer şubeleri görür mü?", "Hayır. Kullanıcının erişimi yalnızca bağlı olduğu veya ayrıca yetki verildiği şubelerle sınırlandırılabilir."],
  ["Personel ay içinde şube değiştirebilir mi?", "Evet. Şube geçmişi tarihleriyle tutulur; aylık puantajda personelin hangi şubede kaç gün çalıştığı görülebilir."],
  ["Merkez tüm şubeleri bir arada görebilir mi?", "Firma yöneticisi erişebildiği tüm şubelerin özetini tek görünümde izleyebilir ve gerekirse belirli bir şubeye süzebilir."],
];

export default function MultiBranchPage() {
  const schema = { "@context":"https://schema.org", "@type":"FAQPage", mainEntity: faq.map(([q,a])=>({"@type":"Question",name:q,acceptedAnswer:{"@type":"Answer",text:a}})), url:`${SITE_URL}/cok-subeli-santiye-yonetimi` };
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}} />
    <section className="border-b bg-slate-950 text-white"><div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-sky-300">Merkez + şube düzeni</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Şube ekler. Merkez görür, kontrol eder ve onaylar.</h1><p className="mt-5 text-lg leading-8 text-slate-300">Her şantiye kendi personeli, planı, puantajı ve deposuyla çalışır. Firma yöneticisi bütün operasyonu tek hesaptan izler; kullanıcı yalnızca yetkili olduğu şubeyi görür.</p><Link href="/register" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-3 font-medium hover:bg-sky-400">Ücretsiz deneyin <ArrowRight className="h-4 w-4" /></Link></div><div className="grid content-center gap-3 sm:grid-cols-[1fr_auto_1fr]"><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><Building2 className="h-6 w-6 text-sky-300"/><p className="mt-8 font-semibold">Bolu Şubesi</p><p className="mt-1 text-sm text-slate-400">Plan · Puantaj · Depo</p></div><div className="flex items-center justify-center"><ArrowRight className="h-5 w-5 text-sky-400"/></div><div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-5"><Eye className="h-6 w-6 text-sky-300"/><p className="mt-8 font-semibold">Merkez</p><p className="mt-1 text-sm text-slate-300">Tüm şubeler · Onay · Rapor</p></div></div></div></section>

    <section className="py-16"><div className="mx-auto max-w-6xl px-4"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-sm font-semibold text-primary">Somut bir örnek</p><h2 className="mt-2 text-3xl font-semibold">“Ahmet bu ay Merkez&apos;de 12, Bolu&apos;da 5 gün çalıştı.”</h2><p className="mt-4 leading-7 text-muted-foreground">Personel başka bir şubeye geçtiğinde eski kayıt kaybolmaz. Tarihli şube geçmişi, puantaj döneminde kaç günün hangi şubeye ait olduğunu gösterir. Böylece maaş kontrolü ve taşeron kesintisi aynı bilgi üzerinden yapılır.</p><div className="mt-6 rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Ekim 2026 · Ahmet Yılmaz</p><div className="mt-4 flex gap-3"><span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">Merkez 12 gün</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">Bolu 5 gün</span></div></div></div><PanelScreenshot src="/images/panel/puantaj.png" alt="Şube bazlı personel puantaj ekranı" caption="Puantaj, şube erişimi ve dönem onayıyla birlikte çalışır." /></div></div></section>

    <section className="border-y bg-muted/30 py-16"><div className="mx-auto max-w-6xl px-4"><h2 className="text-3xl font-semibold">Şubeden Merkez&apos;e üç kontrollü akış</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{[
      [GitBranch,"İş planı ve imalat","Şube günlük ekibi ve işi girer. Merkez tüm şubelerin güncel durumunu görür.","/cozumler/gunluk-is-takibi"],
      [Check,"Puantaj dönem onayı","Şube ayı tamamlar; onaylanan dönem kontrollü biçimde kapanır.","/cozumler/puantaj-personel-takibi"],
      [LockKeyhole,"Malzeme talebi ve irsaliye","Talep, onay, irsaliye kontrolü ve stok onayı aynı kayıt üzerinden ilerler.","/cozumler/irsaliye-malzeme-takibi"],
    ].map(([Icon,title,text,href])=>{const I=Icon as typeof GitBranch;return <Link key={String(title)} href={String(href)} className="rounded-2xl border bg-card p-6 hover:border-primary"><I className="h-6 w-6 text-primary"/><h3 className="mt-6 font-semibold">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(text)}</p></Link>})}</div></div></section>

    <section className="py-16"><div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2"><PanelScreenshot src="/images/panel/stok.png" alt="Merkez ve saha depoları stok dağılım ekranı" caption="Tüm depoların toplamı ve şube dağılımı aynı stok ekranında."/><div><p className="text-sm font-semibold text-primary">Depo görünürlüğü</p><h2 className="mt-2 text-3xl font-semibold">Malzeme nerede, Merkez bilir</h2><p className="mt-4 leading-7 text-muted-foreground">Bolu&apos;ya gelen irsaliye Bolu deposunu artırır. Merkez stok dağılımını görür; sevkiyat başka depoya geçtiğinde iki tarafın miktarı tek hareketle güncellenir. Projeye çıkışta teslim alan ve proje bilgisi kayda bağlanır.</p><Link href="/cozumler/irsaliye-malzeme-takibi" className="mt-5 inline-flex items-center gap-2 font-medium text-primary">Bir irsaliyenin yolculuğunu görün <ArrowRight className="h-4 w-4"/></Link></div></div></section>
    <section className="mx-auto max-w-6xl px-4 pb-16"><div className="grid gap-3 md:grid-cols-3">{faq.map(([q,a])=><details key={q} className="rounded-2xl border p-5"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p></details>)}</div><div className="mt-12"><MarketingCta title="Merkez ile şubeleri aynı kayıtta buluşturun" /></div></section>
  </article>;
}
