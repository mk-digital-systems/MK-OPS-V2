"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Archive, Ban, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import type { PaginatedResult, Project } from "@/types/project";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  AUTOMATIC_PROJECT_STATUSES,
  PROJECT_STATUSES,
} from "@/lib/constants/project";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectTypeShortcuts } from "@/components/projects/project-type-shortcuts";
import { ProjectStatusIndicators } from "@/components/projects/project-status-indicators";
import { EditableProjectsGrid } from "@/components/projects/editable-projects-grid";

type Props = {
  title: string;
  result: PaginatedResult<Project>;
  typeOptions: { key: string; label: string }[];
  locations: string[];
  typeLabels: Record<string, string>;
  showCreate?: boolean;
  defaultArchiveScope?: "active" | "archived" | "cancelled" | "all";
  allowArchiveScopeFilter?: boolean;
  showInlineEdit?: boolean;
  exportProjects?: Project[];
};

export function ProjectsTable({
  title,
  result,
  typeOptions,
  locations,
  typeLabels,
  showCreate = true,
  defaultArchiveScope = "active",
  allowArchiveScopeFilter = true,
  showInlineEdit = false,
  exportProjects = result.data,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [dirtyCount] = useState(0);

  function updateParams(updates: Record<string, string | null>) {
    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Kaydedilmemiş proje değişiklikleri var. Filtreyi değiştirmeden önce devam etmek istiyor musunuz?"
      )
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    });
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "project_code",
        header: "Proje ID",
        cell: ({ row }) => (
          <Link
            href={`/projects/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.project_code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Proje Adı",
        cell: ({ row }) => (
          <div className="max-w-[220px] truncate font-medium">
            {row.original.name}
          </div>
        ),
      },
      {
        accessorKey: "project_type",
        header: "Tür",
        cell: ({ row }) =>
          typeLabels[row.original.project_type] ?? row.original.project_type,
      },
      {
        accessorKey: "location",
        header: "Lokasyon",
        cell:({row})=>row.original.project_type==="HP_ODAKLI"?"—":row.original.location,
      },
      {
        id:"sheet_numbers",header:"Paftalar",cell:({row})=>row.original.sheet_summaries?.length?<div className="flex min-w-[150px] flex-wrap gap-1">{row.original.sheet_summaries.map(sheet=><Link key={sheet.id} href={`/projects/${row.original.id}?sheet=${sheet.id}`} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-primary hover:underline">{sheet.sheet_no}</Link>)}</div>:"—",
      },
      {
        id:"matched_sheet_addresses",header:"Eşleşen Pafta Adresi",cell:({row})=>row.original.matched_sheets?.length?<div className="min-w-[240px] space-y-1">{row.original.matched_sheets.map(sheet=><div key={sheet.id} className="rounded-lg border bg-muted/30 px-2 py-1.5"><p className="text-xs font-semibold">{sheet.sheet_no||"Pafta numarası yok"}</p><p className="text-xs text-muted-foreground">{sheet.address}</p><p className="text-[11px] text-primary">{row.original.project_code} · {row.original.name}</p></div>)}</div>:"—",
      },
      {
        id:"progress_percent",header:"İlerleme",cell:({row})=>row.original.project_type==="HP_ODAKLI"?`%${row.original.progress_percent??0}`:"—",
      },
      {
        accessorKey: "status",
        header: "Durum",
        cell: ({ row }) => <ProjectStatusIndicators project={row.original} />,
      },
      {
        accessorKey: "current_team_leader_name",
        header: "Mevcut Ekip Başı",
        cell: ({ row }) => row.original.status === "in_progress" ? (row.original.current_team_leader_name || "—") : "—",
      },
      {
        id: "stage_date",
        header: "Aşama Tarihi",
        cell: ({ row }) => {
          const statusMeta = PROJECT_STATUSES.find(
            (s) => s.value === row.original.status
          );
          const dateKey = statusMeta?.dateKey ?? "waiting_at";
          return formatDate(row.original[dateKey]);
        },
      },
      {
        accessorKey: "received_at",
        header: "Alınan Tarih",
        cell: ({ row }) => formatDate(row.original.received_at),
      },
      {
        accessorKey: "updated_at",
        header: "Güncelleme",
        cell: ({ row }) => formatDateTime(row.original.updated_at),
      },
      {
        accessorKey: "completed_by_name",
        header: "Bitiren Ekip Başı",
        cell: ({ row }) => row.original.completed_by_name || "—",
      },
      {
        accessorKey: "completed_at",
        header: "Bitiş Tarihi",
        cell: ({ row }) => formatDate(row.original.completed_at),
      },
    ],
    [typeLabels]
  );

  const table = useReactTable({
    data: result.data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: result.totalPages,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} kayıt · Sayfa {result.page}/{result.totalPages}
          </p>
        </div>
        {showCreate && (
          <div className="flex flex-wrap items-center gap-4">
            <ProjectTypeShortcuts compact />
            <Button asChild variant="outline">
              <Link href="/archive">
                <Archive className="h-4 w-4" />
                Arşiv
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cancelled-projects">
                <Ban className="h-4 w-4" />
                İptal Alanı
              </Link>
            </Button>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="h-4 w-4" />
                Yeni Proje
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Filtreler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Proje ID, proje adı veya pafta adresi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateParams({ q: search || null, page: "1" });
                  }
                }}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => updateParams({ q: search || null, page: "1" })}
              disabled={isPending}
            >
              Ara
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <Select
              value={searchParams.get("status") ?? "all"}
              onValueChange={(value) => updateParams({ status: value, stage: null, page: "1" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durumlar</SelectItem>
                {AUTOMATIC_PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={searchParams.get("type") ?? "all"}
              onValueChange={(v) => updateParams({ type: v, location: v === "KURUMSAL_TTVPN" || v === "ERISIM_ZORUNLULUK" ? searchParams.get("location") : null, page: "1" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tür" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Türler</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchParams.get("type") === "KURUMSAL_TTVPN" || searchParams.get("type") === "ERISIM_ZORUNLULUK") && (
              <Select value={searchParams.get("location") ?? "all"} onValueChange={(v) => updateParams({ location: v, page: "1" })}>
                <SelectTrigger><SelectValue placeholder="Lokasyon" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Tüm Lokasyonlar</SelectItem>{locations.map(location=><SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent>
              </Select>
            )}

            {allowArchiveScopeFilter ? (
              <Select
                value={
                  (searchParams.get("q") ? "all" : searchParams.get("scope")) ??
                  defaultArchiveScope ??
                  "active"
                }
                onValueChange={(v) => updateParams({ scope: v, page: "1" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kapsam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="archived">Arşiv</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                  <SelectItem value="all">Aktif + Arşiv</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={String(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE)}
                onValueChange={(v) => updateParams({ pageSize: v, page: "1" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sayfa boyutu" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / sayfa
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {showInlineEdit ? (
          <EditableProjectsGrid
            projects={result.data}
            exportProjects={exportProjects}
            typeLabels={typeLabels}
            selectedTypeLabel={searchParams.get("type") && searchParams.get("type") !== "all" ? typeLabels[searchParams.get("type")!] : undefined}
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/40">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.original.status === "completed" ? "border-b border-blue-300 bg-blue-50 last:border-0 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40" : "border-b last:border-0 hover:bg-accent/30"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sayfa boyutu</span>
            <Select
              value={String(result.pageSize)}
              onValueChange={(v) => updateParams({ pageSize: v, page: "1" })}
            >
              <SelectTrigger className="h-9 w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={result.page <= 1 || isPending}
              onClick={() =>
                updateParams({ page: String(Math.max(1, result.page - 1)) })
              }
            >
              <ChevronLeft className="h-4 w-4" />
              Önceki
            </Button>
            <span className="text-sm text-muted-foreground">
              {result.page} / {result.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={result.page >= result.totalPages || isPending}
              onClick={() =>
                updateParams({
                  page: String(Math.min(result.totalPages, result.page + 1)),
                })
              }
            >
              Sonraki
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
