"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Archive,
  CalendarClock,
  CarFront,
  CheckCircle2,
  FolderKanban,
  HardHat,
  PauseCircle,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardCategoryAnalysis,
  DashboardCriticalStats,
  DashboardStats,
  Project,
} from "@/types/project";
import type { VehicleDeadlineAlert } from "@/types/vehicle";
import { Badge } from "@/components/ui/badge";
import { getStatusColor, getStatusLabel } from "@/lib/constants/project";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ProjectTypeShortcuts } from "@/components/projects/project-type-shortcuts";
import { CategoryDoughnutChart } from "@/components/dashboard/category-doughnut-chart";

const STAT_CARDS = [
  {
    key: "total" as const,
    label: "Toplam Proje",
    icon: FolderKanban,
    href: "/projects",
  },
  {
    key: "waiting" as const,
    label: "Başlamadı",
    icon: PauseCircle,
    href: "/projects?status=waiting",
  },
  {
    key: "in_progress" as const,
    label: "Devam Ediyor",
    icon: HardHat,
    href: "/projects?status=in_progress",
  },
  {
    key: "delayed" as const,
    label: "Gecikmiş",
    icon: TriangleAlert,
    href: "/projects?status=delayed",
  },
  {
    key: "completed" as const,
    label: "Tamamlandı",
    icon: CheckCircle2,
    href: "/archive?status=completed",
  },
  {
    key: "archived" as const,
    label: "Arşiv",
    icon: Archive,
    href: "/archive",
  },
];

type Props = {
  stats: DashboardStats;
  categoryAnalysis: DashboardCategoryAnalysis[];
  criticalStats: DashboardCriticalStats;
  recentlyUpdated: Project[];
  recentlyCreated: Project[];
  typeLabels: Record<string, string>;
  vehicleAlerts: VehicleDeadlineAlert[];
};

export function DashboardView({
  stats,
  categoryAnalysis,
  criticalStats,
  recentlyUpdated,
  recentlyCreated,
  typeLabels,
  vehicleAlerts,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tüm şantiye projelerinin anlık durumu
          </p>
        </div>
        <ProjectTypeShortcuts />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {STAT_CARDS.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.35 }}
            >
              <Link href={card.href}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {card.label}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">
                      {stats[card.key]}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <VehicleDeadlineAlerts alerts={vehicleAlerts} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Kategori Analizi
          </h2>
          <p className="text-sm text-muted-foreground">
            HP Odaklı paftalar, Kurumsal TTVPN projeleri ve BGFD dolaplarının durum dağılımı
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {categoryAnalysis.map((analysis) => (
            <CategoryDoughnutChart
              key={analysis.category}
              analysis={analysis}
            />
          ))}
        </div>
      </section>

      <CriticalSituations stats={criticalStats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectMiniList
          title="Son Güncellenen Projeler"
          projects={recentlyUpdated}
          typeLabels={typeLabels}
        />
        <ProjectMiniList
          title="Son Eklenen Projeler"
          projects={recentlyCreated}
          typeLabels={typeLabels}
        />
      </div>
    </div>
  );
}

function getDeadlineText(daysRemaining: number) {
  if (daysRemaining < 0)
    return `${Math.abs(daysRemaining)} gün gecikti`;
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

function VehicleDeadlineAlerts({
  alerts,
}: {
  alerts: VehicleDeadlineAlert[];
}) {
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
            href="/vehicles"
            className={`rounded-xl border p-4 transition-transform hover:-translate-y-0.5 ${getDeadlineClasses(
              alert.days_remaining
            )}`}
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
              {alert.deadline_type === "inspection"
                ? "Muayene bitiş tarihi"
                : "Sigorta bitiş tarihi"}
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

const CRITICAL_ITEMS = [
  {
    key: "delayed" as const,
    label: "Gecikmiş Projeler",
    color: "bg-red-500",
    href: "/projects?status=delayed",
  },
  {
    key: "excavation_waiting" as const,
    label: "Kazı İzni Bekleyen",
    color: "bg-orange-500",
    href: "/projects?excavation=false",
  },
  {
    key: "obk_waiting" as const,
    label: "OBK Bekleyen",
    color: "bg-violet-500",
    href: "/projects?stage=obk_waiting",
  },
  {
    key: "cable_waiting" as const,
    label: "Kablo Bekleyen",
    color: "bg-yellow-500",
    href: "/projects?stage=cable_waiting",
  },
];

function CriticalSituations({ stats }: { stats: DashboardCriticalStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kritik Durumlar</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CRITICAL_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              {item.label}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {stats[item.key]}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ProjectMiniList({
  title,
  projects,
  typeLabels,
}: {
  title: string;
  projects: Project[];
  typeLabels: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz proje yok.</p>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {project.project_code} · {project.location} ·{" "}
                  {typeLabels[project.project_type] ?? project.project_type}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge className={getStatusColor(project.status)}>
                  {getStatusLabel(project.status)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateTime(project.updated_at)}
                </span>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
