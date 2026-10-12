import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, ClipboardCheck, HardHat, Package, ReceiptText, Users, Wallet } from "lucide-react";

const NODES = [
  { label: "İş planı", href: "/cozumler/gunluk-is-takibi", icon: CalendarDays },
  { label: "İmalat", href: "/cozumler/gunluk-is-takibi", icon: HardHat },
  { label: "Hakediş", href: "/cozumler/hakedis-takibi", icon: ReceiptText },
  { label: "Taşeron payı", href: "/taseron-takibi", icon: Wallet },
  { label: "Personel", href: "/cozumler/puantaj-personel-takibi", icon: Users },
  { label: "Şube", href: "/cok-subeli-santiye-yonetimi", icon: Building2 },
  { label: "İrsaliye", href: "/cozumler/irsaliye-malzeme-takibi", icon: ClipboardCheck },
  { label: "Stok ve sevkiyat", href: "/cozumler/irsaliye-malzeme-takibi", icon: Package },
];

export function ConnectedSystemMap() {
  return (
    <div className="rounded-[2rem] border bg-slate-950 p-5 text-white shadow-xl sm:p-8">
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-300">Bağlantı haritası</p>
        <h3 className="mt-2 text-2xl font-semibold">Bir kayıt, sonraki işi hazırlar</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">Modüller yan yana duran kutular değil; aynı kaydın devamını kullanan bir çalışma düzenidir.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NODES.map((node, index) => (
          <div key={`${node.label}-${index}`} className="flex items-center gap-3">
            <Link href={node.href} className="group flex min-h-24 flex-1 flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-sky-400/60 hover:bg-white/10">
              <node.icon className="h-5 w-5 text-sky-300" />
              <span className="mt-4 text-sm font-semibold">{node.label}</span>
            </Link>
            {index % 4 !== 3 ? <ArrowRight className="hidden h-4 w-4 shrink-0 text-sky-400 lg:block" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
