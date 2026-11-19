import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { APP_NAME, SITE_URL } from "@/lib/constants/brand";
import { Button } from "@/components/ui/button";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { PanelScreenshot } from "@/components/marketing/panel-screenshot";

export type LandingContent = {
  path: string;
  eyebrow: string;
  h1: string;
  lead: string;
  description: string;
  screenshot: { src: string; alt: string; caption: string };
  sections: { title: string; text: string; bullets: string[] }[];
  related: { href: string; label: string; text: string }[];
  faq: [string, string][];
  note?: { title: string; text: string };
  cta?: { title: string; text: string };
  primaryCta?: { href: string; label: string };
};

/** Ortak şablon: yalnızca yeni pazarlama sayfaları kullanır; mevcut sayfalara ve yasal şablonlara dokunmaz. */
export function LandingPage({ c }: { c: LandingContent }) {
  const url = `${SITE_URL}${c.path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, url, name: c.h1, description: c.description, inLanguage: "tr", isPartOf: { "@type": "WebSite", name: APP_NAME, url: SITE_URL } },
      { "@type": "SoftwareApplication", name: APP_NAME, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: SITE_URL, description: c.description },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: APP_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: c.h1, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  const primary = c.primaryCta ?? { href: "/register", label: "48 saat ücretsiz deneyin" };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="overflow-hidden border-b bg-[radial-gradient(circle_at_80%_0%,#dbeafe,transparent_34%)] dark:bg-[radial-gradient(circle_at_80%_0%,#1e3a8a66,transparent_34%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-primary">{c.eyebrow}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{c.h1}</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{c.lead}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href={primary.href}>{primary.label} <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/cozumler">Tüm çözümler</Link></Button>
            </div>
          </div>
          <PanelScreenshot src={c.screenshot.src} alt={c.screenshot.alt} caption={c.screenshot.caption} priority />
        </div>
      </section>

      {c.sections.map((s, i) => (
        <section key={s.title} className={i % 2 === 1 ? "border-y bg-muted/30 py-14" : "py-14"}>
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-semibold tracking-tight">{s.title}</h2>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{s.text}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-6">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {c.note ? (
        <section className="py-10">
          <div className="mx-auto max-w-6xl px-4">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <h2 className="text-xl font-semibold">{c.note.title}</h2>
              <p className="mt-2 leading-7 text-muted-foreground">{c.note.text}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-semibold tracking-tight">İlgili çözümler</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {c.related.map((r) => (
              <Link key={r.href} href={r.href} className="group rounded-2xl border bg-card p-5 hover:border-primary">
                <h3 className="font-semibold group-hover:text-primary">{r.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{r.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30 py-14">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-semibold tracking-tight">Sık sorulan sorular</h2>
          <div className="mt-8 space-y-3">
            {c.faq.map(([q, a]) => (
              <details key={q} className="rounded-xl border bg-card p-5">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14"><MarketingCta title={c.cta?.title} text={c.cta?.text} /></div>
    </article>
  );
}
