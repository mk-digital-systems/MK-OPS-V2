"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { ArchiveScope, PaginatedResult, Project, ProjectType } from "@/types/project";
import { PAGE_SIZE_OPTIONS, PROJECT_STATUSES, getStatusLabel } from "@/lib/constants/project";
import { FILE_NAME_PREFIX } from "@/lib/constants/brand";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ProjectTypeShortcuts } from "@/components/projects/project-type-shortcuts";
import { ProgressBar, ProjectStatusBadge, TypeDot } from "@/components/projects/project-status-indicators";

type Props = {
  title: string;
  result: PaginatedResult<Project>;
  types: ProjectType[];
  locations: string[];
  showCreate?: boolean;
  exportProjects?: Project[];
  defaultArchiveScope: ArchiveScope;
  allowArchiveScopeFilter?: boolean;
};

const SCOPE_LABELS: Record<ArchiveScope, string> = {
  active: "Aktif projeler",
  archived: "Arşiv",
  cancelled: "İptal edilenler",
  all: "Tümü (iptal hariç)",
};

export function ProjectsTable({
  title,
  result,
  types,
  locations,
  showCreate = false,
  exportProjects,
  defaultArchiveScope,
  allowArchiveScopeFilter = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [exporting, setExporting] = useState(false);
  const typeById = new Map(types.map((type) => [type.id, type]));

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in updates)) next.delete("page");
    startTransition(() => router.push(`${pathname}${next.toString() ? `?${next}` : ""}`));
  }

  async function exportExcel() {
    if (!exportProjects?.length) {
      toast.error("Aktarılacak proje yok");
      return;
    }
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet("Projeler");
      sheet.columns = [
        { header: "Proje Kodu", key: "code", width: 16 },
        { header: "Proje Adı", key: "name", width: 32 },
        { header: "Tür", key: "type", width: 22 },
        { header: "Konum", key: "location", width: 22 },
        { header: "Durum", key: "status", width: 16 },
        { header: "İlerleme %", key: "progress", width: 12 },
        { header: "Başlangıç", key: "start", width: 14 },
        { header: "Planlanan Bitiş", key: "end", width: 16 },
        { header: "Sorumlu Ekip", key: "team", width: 22 },
      ];
      for (const project of exportProjects) {
        sheet.addRow({
          code: project.project_code,
          name: project.name,
          type: typeById.get(project.project_type_id)?.name ?? "",
          location: project.location,
          status: getStatusLabel(project.status),
          progress: project.progress_percent,
          start: project.start_date ? formatDate(project.start_date) : "",
          end: project.estimated_end_date ? formatDate(project.estimated_end_date) : "",
          team: project.current_team_leader_name ?? project.team_name ?? "",
        });
      }
      sheet.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${FILE_NAME_PREFIX}-projeler.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Excel oluşturulamadı", { description: (error as Error)?.message });
    } finally {
      setExporting(false);
    }
  }

  const selectedType = params.get("type") ?? "all";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{result.count} proje</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exportProjects && (
            <Button variant="outline" onClick={exportExcel} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel
            </Button>
          )}
          {showCreate && (
            <Button asChild>
              <Link href="/panel/projects/new">
                <Plus className="h-4 w-4" />
                Yeni Proje
              </Link>
            </Button>
          )}
        </div>
      </div>

      {defaultArchiveScope === "active" && <ProjectTypeShortcuts types={types} selectedTypeId={selectedType} basePath={pathname} />}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <form
            className="relative sm:col-span-2"
            onSubmit={(event) => {
              event.preventDefault();
              setParam({ q: search.trim() || null });
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kod, ad, konum, ekip…" className="pl-9" />
          </form>
          <NativeSelect value={params.get("status") ?? "all"} onChange={(event) => setParam({ status: event.target.value })} aria-label="Durum">
            <option value="all">Tüm durumlar</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={selectedType} onChange={(event) => setParam({ type: event.target.value })} aria-label="Proje türü">
            <option value="all">Tüm türler</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
          {allowArchiveScopeFilter ? (
            <NativeSelect
              value={params.get("scope") ?? defaultArchiveScope}
              onChange={(event) => setParam({ scope: event.target.value === defaultArchiveScope ? null : event.target.value })}
              aria-label="Kapsam"
            >
              {(["active", "archived", "cancelled", "all"] as ArchiveScope[]).map((scope) => (
                <option key={scope} value={scope}>
                  {SCOPE_LABELS[scope]}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <NativeSelect value={params.get("location") ?? "all"} onChange={(event) => setParam({ location: event.target.value })} aria-label="Konum">
              <option value="all">Tüm konumlar</option>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </NativeSelect>
          )}
        </CardContent>
      </Card>

      <div className={cn("transition-opacity", pending && "opacity-60")}>
        {result.data.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-sm text-muted-foreground">
              {types.length === 0 && showCreate ? (
                <>
                  Önce <Link href="/panel/settings" className="font-medium text-primary underline">Ayarlar</Link> sayfasından proje türlerinizi tanımlayın.
                </>
              ) : (
                "Kriterlere uyan proje yok."
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Proje</th>
                    <th className="px-4 py-3 font-medium">Tür</th>
                    <th className="px-4 py-3 font-medium">Konum</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                    <th className="w-44 px-4 py-3 font-medium">İlerleme</th>
                    <th className="px-4 py-3 font-medium">Planlanan bitiş</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.data.map((project) => {
                    const type = typeById.get(project.project_type_id);
                    return (
                      <tr key={project.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <Link href={`/panel/projects/${project.id}`} className="font-medium hover:underline">
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{project.project_code}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <TypeDot color={type?.color ?? null} />
                            {type?.name ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{project.location}</td>
                        <td className="px-4 py-3">
                          <ProjectStatusBadge status={project.status} />
                        </td>
                        <td className="px-4 py-3">
                          <ProgressBar value={project.progress_percent} status={project.status} />
                        </td>
                        <td className={cn("px-4 py-3", project.status === "delayed" && "font-medium text-rose-600")}>
                          {project.estimated_end_date ? formatDate(project.estimated_end_date) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {result.data.map((project) => {
                const type = typeById.get(project.project_type_id);
                return (
                  <Link key={project.id} href={`/panel/projects/${project.id}`} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.project_code} · {project.location}
                        </p>
                      </div>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <TypeDot color={type?.color ?? null} />
                      {type?.name ?? "—"}
                    </p>
                    <ProgressBar value={project.progress_percent} status={project.status} className="mt-3" />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      {result.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            Sayfa başına
            <NativeSelect
              className="h-9 w-20"
              value={String(result.pageSize)}
              onChange={(event) => setParam({ pageSize: event.target.value })}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={result.page <= 1}
              onClick={() => setParam({ page: String(result.page - 1) })}
              aria-label="Önceki sayfa"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              {result.page} / {result.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page >= result.totalPages}
              onClick={() => setParam({ page: String(result.page + 1) })}
              aria-label="Sonraki sayfa"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
