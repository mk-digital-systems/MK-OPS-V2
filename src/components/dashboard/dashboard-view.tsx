import Link from "next/link";
import { CalendarClock, CarFront, ClipboardList, FolderKanban, Settings } from "lucide-react";
import type { DashboardOverview, DashboardStats, DashboardTypeSummary } from "@/types/project";
import type { VehicleDeadlineAlert } from "@/types/vehicle";
import { formatQuantity } from "@/lib/constants/project";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar, ProjectStatusBadge, TypeDot } from "@/components/projects/project-status-indicators";

type Props = {
  stats: DashboardStats;
  overview: DashboardOverview;
  vehicleAlerts: VehicleDeadlineAlert[];
  canManageTypes: boolean;
};

const STAT_CARDS = [
  { key: "total", label: "Aktif proje", href: "/panel/projects", tone: "text-foreground" },
  { key: "waiting", label: "Başlamadı", href: "/panel/projects?status=waiting", tone: "text-slate-600" },
  { key: "in_progress", label: "Devam ediyor", href: "/panel/projects?status=in_progress", tone: "text-blue-600" },
  { key: "on_hold", label: "Beklemede", href: "/panel/projects?status=on_hold", tone: "text-amber-600" },
  { key: "delayed", label: "Gecikti", href: "/panel/projects?status=delayed", tone: "text-rose-600" },
  { key: "completed", label: "Tamamlandı", href: "/panel/projects?status=completed&scope=all", tone: "text-emerald-600" },
] as const;

export function DashboardView({ stats, overview, vehicleAlerts, canManageTypes }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Genel Bakış</h1>
        <p className="mt-1 text-sm text-muted-foreground">Projelerin ve sahadaki işlerin anlık durumu</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {STAT_CARDS.map((card) => (
          <Link key={card.key} href={card.href} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-accent">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${card.tone}`}>{stats[card.key]}</p>
          </Link>
        ))}
      </div>

      <VehicleDeadlineAlerts alerts={vehicleAlerts} />

      {overview.types.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Henüz proje türü tanımlanmadı</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Firmanızın yaptığı iş türlerini (ör. bina inşaatı, altyapı hattı, servis işi) ve aşamalarını tanımlayın; projeler bu
              aşamalara göre takip edilir.
            </p>
            {canManageTypes && (
              <Button asChild>
                <Link href="/panel/settings">
                  <Settings className="h-4 w-4" />
                  Proje türlerini tanımla
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {overview.types.map((type) => (
            <TypeCard key={type.id} type={type} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-primary" />
              Yaklaşan bitiş tarihleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Önümüzdeki 14 gün içinde bitmesi planlanan proje yok.</p>
            ) : (
              <ul className="divide-y">
                {overview.upcoming.map((project) => (
                  <li key={project.id} className="flex items-center gap-3 py-2.5">
                    <Link href={`/panel/projects/${project.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:underline">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.project_code} · {project.estimated_end_date ? formatDate(project.estimated_end_date) : "—"}
                      </p>
                    </Link>
                    <ProgressBar value={project.progress_percent} status={project.status} className="w-28" />
                    <ProjectStatusBadge status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-primary" />
              Son iş kayıtları
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recent_logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz iş kaydı girilmedi.</p>
            ) : (
              <ul className="divide-y">
                {overview.recent_logs.map((log) => (
                  <li key={log.id} className="py-2.5 text-sm">
                    <Link href={`/panel/projects/${log.project_id}`} className="font-medium hover:underline">
                      {log.project_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(log.log_date)} · {log.section_name ? `${log.section_name} · ` : ""}
                      {log.stage_name}
                      {log.quantity !== null && ` · ${formatQuantity(log.quantity, log.unit)}`}
                      {log.team_leader_name && ` · ${log.team_leader_name}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TypeCard({ type }: { type: DashboardTypeSummary }) {
  const counts = [
    { label: "Başlamadı", value: type.waiting },
    { label: "Devam", value: type.in_progress },
    { label: "Beklemede", value: type.on_hold },
    { label: "Gecikti", value: type.delayed },
    { label: "Tamamlandı", value: type.completed },
  ];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <TypeDot color={type.color} />
        <CardTitle className="flex-1 text-base">{type.name}</CardTitle>
        <Link href={`/panel/projects?type=${type.id}`} className="text-sm text-primary hover:underline">
          {type.total} proje →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2 text-center">
          {counts.map((count) => (
            <div key={count.label} className="rounded-lg bg-muted/50 py-2">
              <p className="text-lg font-semibold tabular-nums">{count.value}</p>
              <p className="text-[10px] text-muted-foreground sm:text-xs">{count.label}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Süren projelerin ortalama ilerlemesi</p>
          <ProgressBar value={type.avg_progress} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Aşamalara göre</p>
          {type.stages.map((stage) => {
            const total = stage.done + stage.in_progress + stage.not_started;
            const pct = (value: number) => (total ? (value / total) * 100 : 0);
            return (
              <div key={stage.id} className="grid grid-cols-[1fr_2fr] items-center gap-3 text-xs">
                <span className="truncate">
                  {stage.name}
                  {stage.unit && stage.done_quantity > 0 && (
                    <span className="text-muted-foreground"> · {formatQuantity(stage.done_quantity, stage.unit)}</span>
                  )}
                </span>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" title={`${stage.done} tamamlandı · ${stage.in_progress} devam · ${stage.not_started} başlamadı`}>
                  <div className="bg-emerald-500" style={{ width: `${pct(stage.done)}%` }} />
                  <div className="bg-blue-500" style={{ width: `${pct(stage.in_progress)}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex gap-4 pt-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" />
              Tamamlandı
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-blue-500" />
              Devam ediyor
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-muted-foreground/30" />
              Başlamadı
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getDeadlineText(daysRemaining: number) {
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} gün gecikti`;
  if (daysRemaining === 0) return "Bugün sona eriyor";
  return `${daysRemaining} gün kaldı`;
}

function getDeadlineClasses(daysRemaining: number) {
  if (daysRemaining <= 3)
    return "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";
  if (daysRemaining <= 7)
    return "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
  return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
}

function VehicleDeadlineAlerts({ alerts }: { alerts: VehicleDeadlineAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card className="border-amber-300 dark:border-amber-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-amber-600" />
          Araç Muayene ve Sigorta Uyarıları
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {alerts.map((alert) => (
          <Link
            key={`${alert.vehicle_id}-${alert.deadline_type}`}
            href="/panel/vehicles"
            className={`rounded-xl border p-4 transition-transform hover:-translate-y-0.5 ${getDeadlineClasses(alert.days_remaining)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <CarFront className="h-4 w-4" />
                {alert.plate}
              </span>
              <Badge className="shrink-0 border-current bg-transparent text-current hover:bg-transparent">
                {getDeadlineText(alert.days_remaining)}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium">
              {alert.deadline_type === "inspection" ? "Muayene bitiş tarihi" : "Sigorta bitiş tarihi"}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {alert.brand} {alert.model} · {formatDate(alert.deadline_date)}
            </p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
