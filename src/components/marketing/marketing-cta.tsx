import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/constants/brand";
import { Button } from "@/components/ui/button";

export function MarketingCta({
  title = "Kendi iş akışınızla deneyin",
  text = "Kurulum ve kredi kartı gerekmez. Firmanızı oluşturun, bütün modülleri 48 saat ücretsiz kullanın.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="rounded-[2rem] bg-slate-950 px-6 py-10 text-center text-white sm:px-10">
      <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="bg-sky-500 hover:bg-sky-400">
          <Link href="/register">48 saat ücretsiz deneyin <ArrowRight className="h-4 w-4" /></Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
          <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp&apos;tan sorun</a>
        </Button>
      </div>
    </section>
  );
}
