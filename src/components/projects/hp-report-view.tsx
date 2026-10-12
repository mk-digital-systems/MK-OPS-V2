"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { HpReport } from "@/types/project";
import { getStatusLabel, todayISODate } from "@/lib/constants/project";
import { FILE_NAME_PREFIX } from "@/lib/constants/brand";
import { cn, formatDate } from "@/lib/utils";
import { useBranches } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectStatusBadge } from "@/components/projects/project-status-indicators";

const hp = (value: number) => value.toLocaleString("tr-TR");
const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Hazır dönemler (İstanbul tarihine göre bugünden). */
function presets(): { label: string; from: string; to: string }[] {
  const today = todayISODate();
  const [year, month, day] = today.split("-").map(Number);
  const lastMonthEnd = new Date(year, month - 1, 0);
  const weekAgo = new Date(year, month - 1, day - 6);
  return [
    { label: "Bugün", from: today, to: today },
    { label: "Son 7 gün", from: iso(weekAgo), to: today },
    { label: "Bu ay", from: `${today.slice(0, 8)}01`, to: today },
    { label: "Geçen ay", from: iso(new Date(year, month - 2, 1)), to: iso(lastMonthEnd) },
    { label: "Bu yıl", from: `${year}-01-01`, to: today },
  ];
}

export function HpReportView({ report, from, to }: { report: HpReport; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { multiBranch, branchName } = useBranches();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState({ from, to });
  const [onlyPeriod, setOnlyPeriod] = useState(false);
  const [exporting, setExporting] = useState(false);
  const t = report.totals;
  const remaining = Math.max(0, t.total_hp - t.completed_hp);
  const completedPercent = t.total_hp ? Math.round((t.completed_hp / t.total_hp) * 100) : 0;
  const projects = onlyPeriod ? report.projects.filter((project) => project.period_sheets > 0) : report.projects;
  const periodLabel = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

  function apply(next: { from: string; to: string }) {
    if (!next.from || !next.to) {
      toast.error("Başlangıç ve bitiş tarihini seçin");
      return;
    }
    setRange(next);
    startTransition(() => router.push(`${pathname}?from=${next.from}&to=${next.to}`));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const summary = workbook.addWorksheet("Projeler");
      summary.columns = [
        { header: "Proje Kodu", key: "code", width: 16 },
        { header: "Proje Adı", key: "name", width: 32 },
        { header: "Durum", key: "status", width: 16 },
        { header: "Pafta", key: "sheets", width: 10 },
        { header: "Biten Pafta", key: "done_sheets", width: 12 },
        { header: "Toplam HP", key: "total", width: 12 },
        { header: "Tamamlanan HP", key: "done", width: 15 },
        { header: "Kalan HP", key: "left", width: 12 },
        { header: `Dönemde Biten HP (${periodLabel})`, key: "period", width: 30 },
      ];
      for (const project of report.projects) {
        summary.addRow({
          code: project.project_code,
          name: project.name,
          status: getStatusLabel(project.status),
          sheets: project.sheet_count,
          done_sheets: project.completed_sheets,
          total: project.total_hp,
          done: project.completed_hp,
          left: project.total_hp - project.completed_hp,
          period: project.period_hp,
        });
      }
      summary.getRow(1).font = { bold: true };
      const detail = workbook.addWorksheet("Dönemde Biten Paftalar");
      detail.columns = [
        { header: "Bitiş Tarihi", key: "date", width: 14 },
        { header: "Proje Kodu", key: "code", width: 16 },
        { header: "Proje Adı", key: "name", width: 30 },
        { header: "Pafta No", key: "sheet", width: 14 },
        { header: "HP", key: "hp", width: 10 },
        { header: "Adres", key: "address", width: 32 },
        { header: "Bitiren Ekip Başı", key: "leader", width: 22 },
      ];
      for (const sheet of report.period_sheets) {
        detail.addRow({
          date: formatDate(sheet.completed_at),
          code: sheet.project_code,
          name: sheet.project_name,
          sheet: sheet.sheet_no,
          hp: sheet.hp_count,
          address: sheet.address ?? "",
          leader: sheet.completed_by_name ?? "",
        });
      }
      detail.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${FILE_NAME_PREFIX}-hp-raporu-${from}-${to}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Excel oluşturulamadı", { description: (error as Error)?.message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={cn("space-y-6 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/panel/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Projeler
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">HP Raporu</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tamamlanan HP, paftanın bitiş tarihine göre hesaplanır. İptal edilen projeler dahil değildir.</p>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={exporting || report.projects.length === 0}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Excel
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label htmlFor="hp-from">Başlangıç</Label>
            <Input id="hp-from" type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hp-to">Bitiş</Label>
            <Input id="hp-to" type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className="w-40" />
          </div>
          <Button onClick={() => apply(range)} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Göster
          </Button>
          <div className="flex flex-wrap gap-1">
            {presets().map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant={preset.from === from && preset.to === to ? "default" : "outline"}
                onClick={() => apply(preset)}
                disabled={pending}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Seçilen dönem · {periodLabel}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Tamamlanan HP" value={hp(t.period_hp)} highlight />
          <Stat label="Biten pafta" value={hp(t.period_sheets)} />
          <Stat label="Biten proje" value={hp(t.period_completed_projects)} hint="Son paftası bu dönemde biten" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Genel (bütün HP projeleri)</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Toplam HP" value={hp(t.total_hp)} hint={`${hp(t.projects)} proje · ${hp(t.sheets)} pafta`} />
          <Stat label="Tamamlanan HP" value={hp(t.completed_hp)} hint={`%${completedPercent} · ${hp(t.completed_sheets)} pafta`} highlight />
          <Stat label="Kalan HP" value={hp(remaining)} hint={`${hp(t.sheets - t.completed_sheets)} pafta`} />
          <Stat label="Biten proje" value={hp(t.completed_projects)} hint={`${hp(t.projects)} projeden`} />
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Proje bazında</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={onlyPeriod} onChange={(event) => setOnlyPeriod(event.target.checked)} />
            Yalnızca bu dönemde pafta bitenler
          </label>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Gösterilecek HP projesi yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Proje</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                    <th className="px-4 py-3 text-right font-medium">Pafta</th>
                    <th className="px-4 py-3 text-right font-medium">Toplam HP</th>
                    <th className="px-4 py-3 text-right font-medium">Tamamlanan</th>
                    <th className="px-4 py-3 text-right font-medium">Kalan</th>
                    <th className="px-4 py-3 text-right font-medium">Dönemde biten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/panel/projects/${project.id}`} className="font-medium hover:underline">
                          {project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {project.project_code}
                          {multiBranch && branchName(project.branch_id) ? ` · ${branchName(project.branch_id)}` : ""}
                          {project.is_archived ? " · Arşivde" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <ProjectStatusBadge status={project.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {project.completed_sheets}/{project.sheet_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{hp(project.total_hp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{hp(project.completed_hp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{hp(project.total_hp - project.completed_hp)}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", project.period_hp > 0 && "text-emerald-700 dark:text-emerald-300")}>
                        {hp(project.period_hp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bu dönemde biten paftalar ({hp(report.period_sheets.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.period_sheets.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Bu dönemde biten pafta yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Bitiş</th>
                    <th className="px-4 py-3 font-medium">Proje</th>
                    <th className="px-4 py-3 font-medium">Pafta</th>
                    <th className="px-4 py-3 text-right font-medium">HP</th>
                    <th className="px-4 py-3 font-medium">Bitiren ekip başı</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.period_sheets.map((sheet) => (
                    <tr key={sheet.id}>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(sheet.completed_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/panel/projects/${sheet.project_id}`} className="hover:underline">
                          {sheet.project_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{sheet.project_code}</p>
                      </td>
                      <td className="px-4 py-3">
                        {sheet.sheet_no}
                        {sheet.address && <p className="text-xs text-muted-foreground">{sheet.address}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{hp(sheet.hp_count)}</td>
                      <td className="px-4 py-3">{sheet.completed_by_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, highlight = false }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" : "bg-card"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", highlight && "text-emerald-700 dark:text-emerald-300")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
