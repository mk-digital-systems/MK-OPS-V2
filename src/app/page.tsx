import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  CalendarCheck,
  CarFront,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Hammer,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME, APP_TAGLINE, SITE_URL, contactMailto } from "@/lib/constants/brand";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

const DESCRIPTION =
  "Telekom ve altyapı taşeronları için şantiye operasyon yazılımı: proje ve pafta takibi, günlük iş planı, personel puantajı, malzeme stoku, araç ve ekipman tek panelde. 48 saat ücretsiz deneyin.";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} — ${APP_TAGLINE}` },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: APP_NAME,
    locale: "tr_TR",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: FolderKanban,
    title: "Proje ve pafta takibi",
    text: "BGFD kabin, HP odaklı pafta, kurumsal TTVPN ve erişim zorunluluk projelerini aşama aşama izleyin. Kazı, kablo, ek ve OBK durumları, gecikmeler ve tamamlanma oranı tek tabloda.",
  },
  {
    icon: ClipboardList,
    title: "Günlük iş planı",
    text: "Ekipleri, araçları ve projeleri günlük plana yerleştirin; planı tek tuşla WhatsApp'a hazır görsel olarak paylaşın. Taslaklar ve geçmiş planlar arşivde kalır.",
  },
  {
    icon: CalendarCheck,
    title: "Personel ve puantaj",
    text: "Aylık puantaj, izin ve rapor kayıtları, pazar günleri otomatik hafta tatili. Personel bazlı puantajı Word ve Excel olarak dışa aktarın.",
  },
  {
    icon: Wallet,
    title: "Hakediş günleri ve avans",
    text: "Çalışılan ve ücrete esas günleri otomatik hesaplayın, avansları kaydedin, işten ayrılan personelin dönemini kilitleyin.",
  },
  {
    icon: Boxes,
    title: "Malzeme stoku",
    text: "İrsaliye ile malzeme girişi, kategori bazlı stok, sevkiyat ve malzeme talepleri. Stok listesini Excel ve PDF olarak alın.",
  },
  {
    icon: CarFront,
    title: "Araç ve ekipman",
    text: "Araç-personel eşleşmesi, yakıt alımları ve kilometre takibi. El aletleri ve ekipmanların depo, araç ve personel arasındaki zimmeti.",
  },
  {
    icon: Hammer,
    title: "Günlük imalat",
    text: "Ekiplerin günlük imalatlarını iş kalemleriyle kaydedin; günlük imalat raporunu PDF olarak oluşturup paylaşın.",
  },
  {
    icon: KeyRound,
    title: "Rol ve yetki",
    text: "Şantiye şefi, şirket yöneticisi ve muhasebe rolleri. Yöneticilere modül bazında yazma yetkisi verin; diğer alanlar salt okunur kalsın.",
  },
];

const STEPS = [
  {
    title: "Şirketinizi kurun",
    text: "Kayıt olurken şirket adınızı girin. Şirketin şantiye şefi olursunuz ve 48 saatlik ücretsiz deneme hemen başlar.",
  },
  {
    title: "Ekibinizi ekleyin",
    text: "Ayarlar sayfasındaki 4 haneli katılım kodunu ekibinizle paylaşın. Katılan kullanıcıları onaylayıp rollerini belirlersiniz.",
  },
  {
    title: "Planınızı seçin",
    text: "Panelin Destek bölümünden plan talebinizi iletin. Ödeme EFT/havale ile alınır; planınız aynı gün aktif edilir, verileriniz olduğu gibi kalır.",
  },
];

const FAQ = [
  {
    question: "Deneme süresi bittiğinde verilerim silinir mi?",
    answer:
      "Hayır. Deneme süresi dolduğunda panele erişim durur ama verileriniz korunur. Plan atandığında kaldığınız yerden devam edersiniz.",
  },
  {
    question: "Kredi kartı gerekiyor mu?",
    answer:
      "Hayır. Deneme için ödeme bilgisi istenmez. Planlar EFT/havale ile ödenir ve otomatik yenileme yapılmaz.",
  },
  {
    question: "Başka şirketler verilerimi görebilir mi?",
    answer:
      "Hayır. Her şirketin verisi veritabanı seviyesinde ayrılır; kullanıcılar yalnızca kendi şirketlerinin kayıtlarına erişebilir.",
  },
  {
    question: "Çalışanlarım nasıl katılır?",
    answer:
      "Kayıt ekranında 'Şirkete katıl' seçeneğiyle şirket adını ve katılım kodunu girerler. Şantiye şefi onaylayana kadar hiçbir veriye erişemezler.",
  },
  {
    question: "Hangi işler için uygun?",
    answer:
      "Fiber, bakır şebeke ve altyapı işleri yapan telekom taşeronları için tasarlandı. Proje türlerinin dışında özel kategoriler de tanımlayabilirsiniz.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader signedIn={!!user} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100 via-background to-background dark:from-slate-900">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Telekom ve altyapı taşeronları için
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Şantiyenizi tek panelden yönetin
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Projeler, günlük iş planı, puantaj, malzeme stoku, araçlar ve imalatlar aynı yerde. Excel
                dosyaları ve mesaj gruplarında dağılan bilgiyi tek kayda toplayın.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href={user ? "/panel" : "/register"}>{user ? "Panele Git" : "48 Saat Ücretsiz Dene"}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={contactMailto()}>
                    <Mail className="h-4 w-4" />
                    Bilgi Al
                  </a>
                </Button>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["Kredi kartı gerekmez", "Kurulum yok, tarayıcıdan çalışır", "Veriler şirketinize özel"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden justify-center md:flex">
              <div className="rounded-3xl border bg-background/80 p-8 shadow-xl">
                <BrandLogo size={220} priority className="rounded-3xl ring-0" />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="ozellikler" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Sahada ihtiyacınız olan her şey</h2>
              <p className="mt-3 text-muted-foreground">
                Gerçek bir telekom şantiyesinde, günlük operasyonun içinden geliştirildi.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-2xl border bg-card p-5">
                  <feature.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="nasil-calisir" className="scroll-mt-20 border-y border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Nasıl çalışır?</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border bg-background p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Security */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
            {[
              {
                icon: LockKeyhole,
                title: "Şirket verileri ayrı",
                text: "Her şirketin kayıtları veritabanı kurallarıyla ayrılır; başka bir şirketin kullanıcısı göremez veya değiştiremez.",
              },
              {
                icon: Users,
                title: "Onaysız erişim yok",
                text: "Şirkete katılan her kullanıcı şantiye şefi onaylayana kadar bekler; roller ve modül yetkileri şef tarafından verilir.",
              },
              {
                icon: ShieldCheck,
                title: "Güvenli bağlantı",
                text: "Tüm trafik şifreli (HTTPS) taşınır. Oturumlar ve dosyalar yetkiye bağlı olarak korunur.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <item.icon className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="fiyatlandirma" className="scroll-mt-20 border-y border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Fiyatlandırma</h2>
            <p className="mt-3 text-muted-foreground">
              Kullanıcı sayınıza ve ihtiyacınıza göre plan sunuyoruz. Önce 48 saat ücretsiz deneyin, sonra size uygun
              planı birlikte belirleyelim.
            </p>
            <div className="mt-8 rounded-2xl border bg-background p-8 text-left shadow-sm">
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  "48 saat ücretsiz deneme",
                  "Bütün modüller denemede açık",
                  "Ödeme EFT / havale ile",
                  "Otomatik yenileme yok",
                  "Aylık veya yıllık plan",
                  "Plan değişince veriler korunur",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={user ? "/panel" : "/register"}>{user ? "Panele Git" : "Ücretsiz Dene"}</Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={contactMailto("MK OPS plan ve fiyat teklifi")}>
                    <Mail className="h-4 w-4" />
                    Fiyat Teklifi Al
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sss" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Sık sorulan sorular</h2>
            <div className="mt-8 divide-y rounded-2xl border">
              {FAQ.map((item) => (
                <details key={item.question} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {item.question}
                      <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/60 bg-primary py-14 text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Şantiyenizi bugün dijitale taşıyın</h2>
            <p className="max-w-xl text-primary-foreground/80">
              Kayıt birkaç dakika sürer. 48 saat boyunca bütün modülleri ücretsiz kullanın.
            </p>
            <Button asChild size="lg" variant="secondary">
              <Link href={user ? "/panel" : "/register"}>{user ? "Panele Git" : "Ücretsiz Başla"}</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
