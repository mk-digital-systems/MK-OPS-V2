// Landing sayfası için panel ekranlarının örnek verili çizimleri.
// Kişi, şirket ve proje adları tamamen örnektir.
import { cn } from "@/lib/utils";

export function BrowserFrame({
  path,
  children,
  className,
}: {
  path: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl shadow-slate-900/10 dark:shadow-black/40",
        className
      )}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate rounded-md bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          mkops · {path}
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

const STATUS = {
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  progress: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  waiting: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  late: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

function Pill({ tone, children }: { tone: keyof typeof STATUS; children: React.ReactNode }) {
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", STATUS[tone])}>{children}</span>;
}

export function DashboardMockup() {
  const cards = [
    { label: "Aktif proje", value: "24", tone: "text-foreground" },
    { label: "Devam eden", value: "11", tone: "text-sky-600" },
    { label: "Geciken", value: "2", tone: "text-red-600" },
    { label: "Bu ay biten", value: "7", tone: "text-emerald-600" },
  ];
  const projects = [
    { name: "Bölge-2 Saha Uygulaması", stage: "Uygulama", progress: 64, tone: "progress" as const, label: "Devam" },
    { name: "Müşteri Kurulumu #318", stage: "Hazırlık", progress: 38, tone: "late" as const, label: "Gecikti" },
    { name: "Merkez Depo Yenileme", stage: "Kontrol", progress: 82, tone: "progress" as const, label: "Devam" },
    { name: "Filo Bakım Programı", stage: "Teslim", progress: 100, tone: "done" as const, label: "Bitti" },
  ];
  return (
    <BrowserFrame path="/panel">
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-2">
            <p className="text-[9px] text-muted-foreground sm:text-[10px]">{card.label}</p>
            <p className={cn("text-lg font-semibold sm:text-xl", card.tone)}>{card.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border bg-card p-2">
          <p className="mb-2 text-[10px] font-semibold">Projeler</p>
          <div className="space-y-2">
            {projects.map((project) => (
              <div key={project.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-medium">{project.name}</span>
                  <Pill tone={project.tone}>{project.label}</Pill>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", project.tone === "late" ? "bg-red-500" : project.tone === "done" ? "bg-emerald-500" : "bg-sky-500")}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-[9px] text-muted-foreground">{project.stage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden rounded-lg border bg-card p-2 sm:block">
          <p className="mb-2 text-[10px] font-semibold">Aylık tamamlanan</p>
          <div className="flex h-28 items-end gap-1.5">
            {[35, 52, 44, 70, 58, 86].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-primary/80" style={{ height: `${height}%` }} />
                <span className="text-[8px] text-muted-foreground">{["May", "Haz", "Tem", "Ağu", "Eyl", "Eki"][index]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function WorkPlanMockup() {
  const teams = [
    { leader: "Ahmet Yılmaz", members: 4, vehicle: "34 ABC 128", job: "Bölge-2 — saha uygulaması" },
    { leader: "Mehmet Kaya", members: 3, vehicle: "06 KLM 451", job: "Müşteri #318 — kurulum" },
    { leader: "Hasan Demir", members: 5, vehicle: "35 TRS 902", job: "Merkez depo — bakım" },
  ];
  return (
    <BrowserFrame path="/panel/work-plans">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Günlük İş Planı · 14 Ekim</p>
        <span className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white">WhatsApp&apos;a gönder</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border text-[10px]">
        <div className="grid grid-cols-[1.1fr_0.5fr_0.9fr_1.5fr] bg-muted/70 px-2 py-1.5 font-semibold">
          <span>Ekip şefi</span>
          <span>Kişi</span>
          <span>Araç</span>
          <span>İş</span>
        </div>
        {teams.map((team) => (
          <div key={team.leader} className="grid grid-cols-[1.1fr_0.5fr_0.9fr_1.5fr] border-t px-2 py-1.5">
            <span className="truncate font-medium">{team.leader}</span>
            <span>{team.members}</span>
            <span className="truncate font-mono">{team.vehicle}</span>
            <span className="truncate text-muted-foreground">{team.job}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">İzinli: 2 · Raporlu: 1 · Toplam sahada: 12 kişi</p>
    </BrowserFrame>
  );
}

export function AttendanceMockup() {
  const days = Array.from({ length: 14 }, (_, index) => index + 1);
  const people = [
    { name: "Ali Şahin", pattern: "ççççççpççççççp" },
    { name: "Veli Arslan", pattern: "çççiççpççççççp" },
    { name: "Emre Koç", pattern: "çççççççpçrrççp" },
    { name: "Murat Aydın", pattern: "ççççççpçççççpp" },
  ];
  const cell: Record<string, string> = {
    ç: "bg-emerald-500",
    p: "bg-slate-300 dark:bg-slate-600",
    i: "bg-amber-400",
    r: "bg-violet-400",
  };
  return (
    <BrowserFrame path="/panel/attendance">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Puantaj · Ekim</p>
        <div className="flex gap-1">
          <span className="rounded-md border px-2 py-1 text-[10px]">Excel</span>
          <span className="rounded-md border px-2 py-1 text-[10px]">Word</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-[8px] text-muted-foreground">
          <span />
          <div className="grid grid-cols-14 gap-0.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
            {days.map((day) => (
              <span key={day} className="text-center">{day}</span>
            ))}
          </div>
        </div>
        {people.map((person) => (
          <div key={person.name} className="grid grid-cols-[80px_1fr] items-center gap-2">
            <span className="truncate text-[10px] font-medium">{person.name}</span>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
              {person.pattern.split("").map((code, index) => (
                <span key={index} className={cn("h-3.5 rounded-sm", cell[code])} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[9px] text-muted-foreground">
        {[
          ["bg-emerald-500", "Çalıştı"],
          ["bg-slate-300 dark:bg-slate-600", "Hafta tatili (otomatik)"],
          ["bg-amber-400", "İzinli"],
          ["bg-violet-400", "Raporlu"],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-sm", color)} />
            {label}
          </span>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function InventoryMockup() {
  const rows = [
    { name: "Kablo 3x2,5 mm²", unit: "metre", stock: "1.240", tone: "ok" },
    { name: "Yedek parça — filtre seti", unit: "adet", stock: "64", tone: "ok" },
    { name: "Sarf malzeme kolisi", unit: "koli", stock: "6", tone: "low" },
    { name: "Bağlantı elemanı seti", unit: "adet", stock: "310", tone: "ok" },
  ];
  return (
    <BrowserFrame path="/panel/inventory">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Malzeme Stok</p>
        <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">+ İrsaliye girişi</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border text-[10px]">
        <div className="grid grid-cols-[1.6fr_0.6fr_0.6fr] bg-muted/70 px-2 py-1.5 font-semibold">
          <span>Malzeme</span>
          <span>Birim</span>
          <span className="text-right">Stok</span>
        </div>
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1.6fr_0.6fr_0.6fr] border-t px-2 py-1.5">
            <span className="truncate font-medium">{row.name}</span>
            <span className="text-muted-foreground">{row.unit}</span>
            <span className={cn("text-right font-semibold", row.tone === "low" && "text-red-600")}>{row.stock}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Zimmetli ekipman</p>
          <p className="font-semibold">86 kalem · 9 araç</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Bu hafta sevkiyat</p>
          <p className="font-semibold">14 irsaliye</p>
        </div>
      </div>
    </BrowserFrame>
  );
}
