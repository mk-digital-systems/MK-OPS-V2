import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APP_NAME } from "@/lib/constants/brand";
import { SOLUTIONS } from "@/lib/constants/solutions";

const GUIDES = [
  { href: "/santiye-takip-programi", title: "Şantiye takip programı", text: "İş planından hakedişe bütün kayıtların A'dan Z'ye nasıl bağlandığını görün." },
  { href: "/cok-subeli-santiye-yonetimi", title: "Çok şubeli firma yönetimi", text: "Şube kaydı, Merkez onayı, yetki ve toplu görünüm düzeni." },
  { href: "/taseron-takibi", title: "Taşeron takibi", text: "Taşeron ekibi, imalat payı, ödeme, kesinti ve ekstre akışı." },
  { href: "/santiye-yakit-takibi", title: "Şantiye yakıt takibi", text: "Araç, şube, kilometre, litre ve yaklaşan tarihlerin birlikte takibi." },
];

export const metadata: Metadata = {
  title: "Çözümler",
  description: `${APP_NAME} ile hakediş, günlük iş planı ve imalat, proje ve metraj, malzeme stoku ve depo, puantaj, araç ve ekipman takibi, denetim günlüğü.`,
  alternates: { canonical: "/cozumler" },
};

export default function SolutionsPage() {
  return (
    <div className="mx-auto max-w-4xl text-[15px] leading-7 text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Birbirine bağlı şantiye çözümleri</h1>
      <p className="mt-3">
        {APP_NAME}, sahada ekiplerle çalışan firmaların günlük operasyonunu tek panelde toplar. Her modül, sonraki
        işin verisini hazırlar; iş planı imalata, imalat hakedişe, irsaliye stoğa bağlanır.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {SOLUTIONS.map((item) => (
          <li key={item.slug}>
            <Link href={`/cozumler/${item.slug}`} className="group flex h-full flex-col rounded-2xl border p-5 hover:border-primary">
              <span className="text-lg font-semibold text-foreground">{item.title}</span>
              <span className="mt-2 flex-1 text-sm">{item.description}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                İncele
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-14 border-t pt-10">
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-primary">Operasyon rehberleri</p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">Tek bir modülden daha fazlasını arayanlar için</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <Link key={guide.href} href={guide.href} className="group rounded-2xl bg-slate-950 p-5 text-slate-300 hover:bg-slate-900">
              <span className="font-semibold text-white">{guide.title}</span>
              <span className="mt-2 block text-sm leading-6">{guide.text}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-300">Rehberi açın <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
