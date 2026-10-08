import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CarFront,
  CheckCircle2,
  FileSpreadsheet,
  FolderKanban,
  Hammer,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageCircle,
  PackageSearch,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  APP_LOGO_SRC,
  APP_NAME,
  APP_TAGLINE,
  COMPANY_LEGAL_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
  whatsappUrl,
} from "@/lib/constants/brand";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import {
  AttendanceMockup,
  DashboardMockup,
  InventoryMockup,
  WorkPlanMockup,
} from "@/components/marketing/mockups";
import { Button } from "@/components/ui/button";

// Arama sonucunda görünen başlık; aranan ifadeyi ("şantiye/saha yönetim programı") içerir.
const SEO_TITLE = `${APP_NAME} — Şantiye ve Saha Yönetim Programı`;
const DESCRIPTION =
  "Şantiye ve saha yönetim programı: hakediş, günlük iş planı, imalat, puantaj, malzeme stoku, araç ve ekipman takibi tek panelde. 48 saat ücretsiz deneyin.";

export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SEO_TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: APP_NAME,
    locale: "tr_TR",
    type: "website",
  },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: COMPANY_LEGAL_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}${APP_LOGO_SRC}`,
      email: SUPPORT_EMAIL,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        availableLanguage: "Turkish",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: APP_NAME,
      alternateName: `${APP_NAME} — ${APP_TAGLINE}`,
      url: SITE_URL,
      inLanguage: "tr-TR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

const PAINS = [
  {
    icon: CalendarCheck,
    title: "Ay sonu puantaj kâbusu",
    text: "Kim kaç gün çalıştı, kim izinliydi? Defterler ve Excel dosyaları birleştirilirken saatler gidiyor, hatalar maaşa yansıyor.",
  },
  {
    icon: PhoneCall,
    title: "İşin durumu telefonla soruluyor",
    text: "Bir işin nerede kaldığını öğrenmek için ekipleri tek tek aramak zorunda kalıyorsunuz. Geciken işi geç fark ediyorsunuz.",
  },
  {
    icon: PackageSearch,
    title: "Malzeme ve ekipman kayboluyor",
    text: "Depoda ne kaldı, hangi alet kimde, ne zaman sevk edildi? Kayıt olmadığı için kimse emin değil.",
  },
  {
    icon: MessageCircle,
    title: "Plan mesaj grubunda kayboluyor",
    text: "Günlük iş planı mesajların arasında kayboluyor; dün kim nerede çalıştı sorusunun cevabı yok.",
  },
];

const SOLUTIONS = [
  {
    eyebrow: "Günlük iş planı",
    title: "Sabah planı dakikalar içinde hazır, herkes aynı sayfada",
    text: "Ekipleri, araçları ve yapılacak işleri plana yerleştirin. Plan, tek tuşla WhatsApp'a hazır görsel olarak paylaşılır; geçmiş planlar arşivde kalır.",
    bullets: ["Ekip, araç ve iş eşleştirme", "İzinli ve raporlu personel ayrı listelenir", "Taslak kaydet, sonra yayınla"],
    visual: <WorkPlanMockup />,
  },
  {
    eyebrow: "Personel ve puantaj",
    title: "Puantaj kendiliğinden oluşur, ay sonunda tek tıkla çıktı",
    text: "Günlük kayıtlar puantaja işlenir; hafta tatilleri otomatik atanır. Personel bazlı ya da toplu puantajı Excel ve Word olarak alın.",
    bullets: ["İzin, rapor ve devamsızlık takibi", "Ücrete esas gün ve avans hesabı", "İşe giriş-çıkış ve dönem kilidi"],
    visual: <AttendanceMockup />,
  },
  {
    eyebrow: "Malzeme ve ekipman",
    title: "Depoda ne var, hangi alet kimde — her an bilin",
    text: "İrsaliye ile malzeme girişi yapın, stok hareketlerini izleyin. Ekipmanları depo, araç ve personel arasında zimmetleyin; kim aldı, ne zaman iade etti kayıt altında.",
    bullets: ["Kategori bazlı stok ve sevkiyat", "Malzeme talep ve onay akışı", "Stok listesi Excel / PDF"],
    visual: <InventoryMockup />,
  },
];

const MORE = [
  { icon: FolderKanban, title: "İş ve proje takibi", text: "Aşama, ilerleme, gecikme ve sorumlu ekip." },
  { icon: CarFront, title: "Araç ve yakıt", text: "Araç-personel eşleşmesi, yakıt ve kilometre." },
  { icon: Wallet, title: "Avans ve ödeme günleri", text: "Personel avansları ve ücrete esas günler." },
  { icon: Hammer, title: "Günlük faaliyet raporu", text: "Ekiplerin günlük yaptığı işler, PDF rapor." },
  { icon: KeyRound, title: "Rol ve yetki", text: "Yönetici ve muhasebe rolleri, modül bazında yetki." },
  { icon: Bell, title: "Notlar ve hatırlatmalar", text: "Ekiple paylaşılan ve kişisel notlar." },
  { icon: FileSpreadsheet, title: "Excel, Word, PDF", text: "Listeler ve raporlar tek tıkla dışa aktarılır." },
  { icon: Smartphone, title: "Her cihazda", text: "Kurulum yok; telefon, tablet ve bilgisayardan." },
];

const OUTCOMES = [
  { title: "Tek kayıt", text: "Ofis ve saha aynı bilgiyle çalışır; aynı veriyi iki kez girmezsiniz." },
  { title: "Anlık görünürlük", text: "Hangi iş nerede, hangi ekip nerede — telefon açmadan görürsünüz." },
  { title: "Hesap verebilirlik", text: "Kim, ne zaman, hangi kaydı girdi; malzeme ve ekipman kimde — hepsi kayıtlı." },
  { title: "Hızlı başlangıç", text: "Kurulum yok. Bugün kaydolun, ekibinizi aynı gün ekleyin." },
];

const STEPS = [
  {
    title: "Firmanızı kaydedin",
    text: "Firma adınızla kaydolun. Yönetici hesabınız açılır ve 48 saatlik ücretsiz deneme hemen başlar.",
  },
  {
    title: "Ekibinizi ekleyin",
    text: "4 haneli katılım kodunu ekibinizle paylaşın. Katılan kullanıcıları siz onaylar, rollerini siz belirlersiniz.",
  },
  {
    title: "Planınızı seçin",
    text: "Panelden plan talebinizi iletin; size özel teklifi gönderelim. Ödeme EFT/havale ile, verileriniz olduğu gibi kalır.",
  },
];

const FAQ = [
  {
    question: "Hangi firmalar için uygun?",
    answer:
      "Sahada ekibi, işi, personeli, malzemesi veya aracı olan her firma için. İş ve proje türlerini, kategorileri kendi işinize göre adlandırabilirsiniz.",
  },
  {
    question: "Deneme süresi bittiğinde verilerim silinir mi?",
    answer:
      "Hayır. Deneme süresi dolduğunda panele erişim durur ama verileriniz korunur. Plan tanımlandığında kaldığınız yerden devam edersiniz.",
  },
  {
    question: "Kredi kartı gerekiyor mu?",
    answer: "Hayır. Deneme için ödeme bilgisi istenmez. Planlar EFT/havale ile ödenir ve otomatik yenileme yapılmaz.",
  },
  {
    question: "Fiyatlar nasıl belirleniyor?",
    answer:
      "Kullanıcı sayınıza ve ihtiyaç duyduğunuz kapsama göre firmanıza özel teklif hazırlıyoruz. 1, 3 veya 6 aylık ödeme seçebilirsiniz.",
  },
  {
    question: "Başka firmalar verilerimi görebilir mi?",
    answer:
      "Hayır. Her firmanın verisi veritabanı seviyesinde ayrılır; kullanıcılar yalnızca kendi firmalarının kayıtlarına erişebilir.",
  },
  {
    question: "Çalışanlarım nasıl katılır?",
    answer:
      "Kayıt ekranında 'Şirkete katıl' seçeneğiyle firma adını ve katılım kodunu girerler. Siz onaylayana kadar hiçbir veriye erişemezler.",
  },
];

function PrimaryCta({ signedIn, label = "48 Saat Ücretsiz Dene" }: { signedIn: boolean; label?: string }) {
  return (
    <Button asChild size="lg">
      <Link href={signedIn ? "/panel" : "/register"}>
        {signedIn ? "Panele Git" : label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <SiteHeader signedIn={signedIn} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100 via-background to-background dark:from-slate-900">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                Sahada ekibi olan firmalar için
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Ekiplerinizi, işlerinizi ve kaynaklarınızı <span className="text-primary">tek panelden</span> yönetin
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                İş takibi, günlük plan, puantaj, malzeme stoku ve araçlar aynı yerde. Excel dosyaları ve mesaj
                gruplarında dağılan bilgiyi tek kayda toplayın; ofis ve saha aynı bilgiyle çalışsın.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryCta signedIn={signedIn} />
                <Button asChild size="lg" variant="outline">
                  <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp&apos;tan Bilgi Al
                  </a>
                </Button>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["Kredi kartı gerekmez", "Kurulum yok", "Dakikalar içinde başlayın"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:-mr-8">
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* Pains */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Tanıdık geliyor mu?</h2>
              <p className="mt-3 text-muted-foreground">
                Ekip büyüdükçe defter, Excel ve mesaj grubuyla yürütülen operasyon zaman ve para kaybettirir.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PAINS.map((pain) => (
                <div key={pain.title} className="rounded-2xl border bg-card p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    <pain.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{pain.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{pain.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-lg font-medium">
              {APP_NAME} ile bunların hepsi <span className="text-primary">tek bir panelde</span>.
            </p>
          </div>
        </section>

        {/* Solutions */}
        <section id="ozellikler" className="scroll-mt-20 border-y border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl space-y-20 px-4">
            {SOLUTIONS.map((solution, index) => (
              <div key={solution.eyebrow} className="grid items-center gap-10 lg:grid-cols-2">
                <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary">{solution.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{solution.title}</h3>
                  <p className="mt-4 text-muted-foreground">{solution.text}</p>
                  <ul className="mt-5 space-y-2">
                    {solution.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={index % 2 === 1 ? "lg:order-1" : undefined}>{solution.visual}</div>
              </div>
            ))}
          </div>
        </section>

        {/* More */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Ve dahası</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MORE.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-2xl border bg-card p-4">
                  <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Outcomes */}
        <section className="border-y border-border/60 bg-primary/5 py-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOMES.map((outcome) => (
              <div key={outcome.title}>
                <p className="text-xl font-semibold text-primary">{outcome.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{outcome.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="nasil-calisir" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">3 adımda başlayın</h2>
              <p className="mt-3 text-muted-foreground">Kurulum, eğitim süreci veya donanım gerekmez.</p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border bg-card p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex justify-center">
              <PrimaryCta signedIn={signedIn} label="Hemen Ücretsiz Başla" />
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="border-y border-border/60 bg-muted/30 py-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
            {[
              {
                icon: LockKeyhole,
                title: "Verileriniz size özel",
                text: "Her firmanın kayıtları veritabanı kurallarıyla ayrılır; başka bir firmanın kullanıcısı göremez veya değiştiremez.",
              },
              {
                icon: Users,
                title: "Onaysız erişim yok",
                text: "Firmanıza katılan her kullanıcı siz onaylayana kadar bekler; roller ve modül yetkilerini siz verirsiniz.",
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
        <section id="fiyatlandirma" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-4">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Firmanıza özel fiyat</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Kullanıcı sayınıza ve ihtiyacınıza göre teklif hazırlıyoruz. Önce 48 saat ücretsiz deneyin, sonra karar
                verin.
              </p>
            </div>
            <div className="mt-10 grid overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[1.3fr_1fr]">
              <div className="p-8">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Her planda</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    "Bütün modüller",
                    "Excel, Word, PDF çıktılar",
                    "Rol ve yetki yönetimi",
                    "Mobil uyumlu kullanım",
                    "Destek talebi ile yardım",
                    "Veriler firmanıza özel",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-center gap-3 border-t bg-muted/40 p-8 md:border-l md:border-t-0">
                <p className="text-sm text-muted-foreground">Ödeme EFT/havale ile. 1, 3 veya 6 aylık. Otomatik yenileme yok.</p>
                <Button asChild size="lg">
                  <a href={whatsappUrl("MK OPS için fiyat teklifi almak istiyorum.")} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Teklif Al
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("MK OPS fiyat teklifi")}`}>
                    <Mail className="h-4 w-4" />
                    E-posta ile sor
                  </a>
                </Button>
                {!signedIn && (
                  <Link href="/register" className="text-center text-sm font-medium text-primary hover:underline">
                    veya 48 saat ücretsiz deneyin
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sss" className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Sık sorulan sorular</h2>
            <div className="mt-8 divide-y rounded-2xl border bg-background">
              {FAQ.map((item) => (
                <details key={item.question} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium">
                    <span className="flex items-center justify-between gap-4">
                      {item.question}
                      <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-primary py-16 text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Operasyonunuzu bugün tek panele taşıyın</h2>
            <p className="max-w-xl text-primary-foreground/80">
              Kayıt birkaç dakika sürer. 48 saat boyunca bütün modülleri ücretsiz kullanın; beğenmezseniz hiçbir ücret
              ödemezsiniz.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href={signedIn ? "/panel" : "/register"}>
                  {signedIn ? "Panele Git" : "Ücretsiz Başla"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Bize Yazın
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
