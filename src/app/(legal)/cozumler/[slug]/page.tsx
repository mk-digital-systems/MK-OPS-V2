import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import { APP_NAME, SITE_URL, whatsappUrl } from "@/lib/constants/brand";
import { SOLUTIONS, getSolution } from "@/lib/constants/solutions";
import { Button } from "@/components/ui/button";

type Params = { params: Promise<{ slug: string }> };

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
    openGraph: { title: `${solution.title} — ${APP_NAME}`, description: solution.description, url: `/cozumler/${solution.slug}` },
  };
}

export default async function SolutionPage({ params }: Params) {
  const solution = getSolution((await params).slug);
  if (!solution) notFound();
  const related = solution.related.map(getSolution).filter((item) => item !== null);

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
