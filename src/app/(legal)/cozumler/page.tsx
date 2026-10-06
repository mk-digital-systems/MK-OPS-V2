import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APP_NAME } from "@/lib/constants/brand";
import { SOLUTIONS } from "@/lib/constants/solutions";

export const metadata: Metadata = {
  title: "Çözümler",
  description: `${APP_NAME} ile hakediş, günlük iş planı ve imalat, proje ve metraj, malzeme stoku ve depo, puantaj, araç ve ekipman takibi.`,
  alternates: { canonical: "/cozumler" },
};

export default function SolutionsPage() {
  return (
    <div className="text-[15px] leading-7 text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Çözümler</h1>
      <p className="mt-3">
        {APP_NAME}, sahada ekiplerle çalışan firmaların günlük operasyonunu tek panelde toplar. Sektörünüz ne olursa olsun
        iş türlerinizi, iş kalemlerinizi ve depolarınızı kendiniz tanımlarsınız.
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
    </div>
  );
}
