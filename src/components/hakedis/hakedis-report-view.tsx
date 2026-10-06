"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CurrencyCode } from "@/types/auth";
import type { HakedisReport } from "@/types/hakedis";
import type { HakedisPeriod } from "@/lib/hakedis";
import { formatMoney } from "@/lib/hakedis";
import { formatQuantity } from "@/lib/constants/project";
import { FILE_NAME_PREFIX } from "@/lib/constants/brand";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Props = {
  report: HakedisReport;
  periods: HakedisPeriod[];
  currency: CurrencyCode;
  canEditPrices: boolean;
};

type Tab = "projects" | "stages" | "leaders" | "rows";

export function HakedisReportView({ report, periods, currency, canEditPrices }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("projects");
  const [customStart, setCustomStart] = useState(report.start);
  const [customEnd, setCustomEnd] = useState(report.end);
  const [exporting, setExporting] = useState(false);
  const selectedPeriod = periods.find((period) => period.start === report.start && period.end === report.end);
  const money = (value: number | null) => formatMoney(value, currency);

  function go(start: string, end: string) {
    startTransition(() => router.push(`${pathname}?start=${start}&end=${end}`));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const moneyFormat = currency === "TRY" ? '#,##0.00 "₺"' : currency === "USD" ? '"$"#,##0.00' : '#,##0.00 "€"';

      const summary = workbook.addWorksheet("Özet");
      summary.addRows([
        ["Hakediş dönemi", `${formatDate(report.start)} – ${formatDate(report.end)}`],
        ["Toplam hakediş", Number(report.total_amount)],
        ["Fiyatlı kayıt", report.priced_count],
        ["Fiyatsız kayıt", report.unpriced_count],
      ]);
      summary.getCell("B2").numFmt = moneyFormat;
      summary.getColumn(1).width = 22;
      summary.getColumn(2).width = 30;

      const projects = workbook.addWorksheet("Projeler");
      projects.columns = [
        { header: "Proje Kodu", key: "code", width: 16 },
        { header: "Proje", key: "name", width: 32 },
        { header: "Tür", key: "type", width: 22 },
        { header: "Tutar", key: "amount", width: 18, style: { numFmt: moneyFormat } },
      ];
      report.by_project.forEach((row) =>
        projects.addRow({ code: row.project_code, name: row.project_name, type: row.type_name, amount: Number(row.amount) })
      );

      const stages = workbook.addWorksheet("Aşamalar");
      stages.columns = [
        { header: "Tür", key: "type", width: 22 },
        { header: "Aşama", key: "stage", width: 26 },
        { header: "Miktar", key: "quantity", width: 14 },
        { header: "Birim", key: "unit", width: 10 },
        { header: "Tutar", key: "amount", width: 18, style: { numFmt: moneyFormat } },
      ];
      report.by_stage.forEach((row) =>
        stages.addRow({ type: row.type_name, stage: row.stage_name, quantity: Number(row.quantity), unit: row.unit ?? "", amount: Number(row.amount) })
      );

      const detail = workbook.addWorksheet("Ayrıntı");
      detail.columns = [
        { header: "Tarih", key: "date", width: 12 },
        { header: "Proje Kodu", key: "code", width: 14 },
        { header: "Proje", key: "project", width: 28 },
        { header: "Bölüm", key: "section", width: 16 },
        { header: "Aşama", key: "stage", width: 22 },
        { header: "Miktar", key: "quantity", width: 12 },
        { header: "Birim", key: "unit", width: 8 },
        { header: "Birim Fiyat", key: "price", width: 14, style: { numFmt: moneyFormat } },
        { header: "Tutar", key: "amount", width: 16, style: { numFmt: moneyFormat } },
        { header: "Ekip Şefi", key: "leader", width: 20 },
        { header: "Not", key: "notes", width: 30 },
      ];
      report.rows.forEach((row) =>
        detail.addRow({
          date: formatDate(row.log_date),
          code: row.project_code,
          project: row.project_name,
          section: row.section_name ?? "",
          stage: row.stage_name,
          quantity: Number(row.quantity),
          unit: row.unit ?? "",
          price: row.unit_price === null ? null : Number(row.unit_price),
          amount: row.amount === null ? null : Number(row.amount),
          leader: row.team_leader_name ?? "",
          notes: row.notes ?? "",
        })
      );
      for (const sheet of [projects, stages, detail]) sheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${FILE_NAME_PREFIX}-hakedis-${report.start}_${report.end}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Excel oluşturulamadı", { description: (error as Error)?.message });
    } finally {
      setExporting(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "projects", label: `Projeler (${report.by_project.length})` },
    { key: "stages", label: `Aşamalar (${report.by_stage.length})` },
    { key: "leaders", label: "Ekip şefleri" },
    { key: "rows", label: `Ayrıntı (${report.rows.length})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hakediş</h1>
          <p className="mt-1 text-sm text-muted-foreground">Yapılan işin değeri: miktar × birim fiyat</p>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={exporting || report.rows.length === 0}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Excel
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Dönem</p>
            <NativeSelect
              value={selectedPeriod ? selectedPeriod.start : "custom"}
              onChange={(event) => {
                const period = periods.find((item) => item.start === event.target.value);
                if (period) go(period.start, period.end);
              }}
            >
              {periods.map((period) => (
                <option key={period.start} value={period.start}>
                  {period.label}
                  {period.isActive ? " (aktif dönem)" : ""}
                </option>
              ))}
              {!selectedPeriod && <option value="custom">Özel aralık</option>}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Başlangıç</p>
            <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Bitiş</p>
            <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => customStart && customEnd && go(customStart, customEnd)} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Göster
          </Button>
        </CardContent>
      </Card>

      <div className={cn("grid gap-3 sm:grid-cols-3", pending && "opacity-60")}>
        <div className="rounded-2xl border bg-card p-5 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Toplam hakediş</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">{money(report.total_amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(report.start)} – {formatDate(report.end)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">Fiyatlanan iş kaydı</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{report.priced_count}</p>
        </div>
        <div className={cn("rounded-2xl border p-5", report.unpriced_count > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : "bg-card")}>
          <p className="text-xs text-muted-foreground">Fiyatı girilmemiş kayıt</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{report.unpriced_count}</p>
          {report.unpriced_count > 0 && (
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Bu kayıtlar toplama dahil değil.{" "}
              {canEditPrices ? (
                <Link href="/panel/settings" className="underline">
                  Aşama fiyatlarını girin
                </Link>
              ) : (
                "Fiyat girilmesi için yöneticinize başvurun."
              )}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap gap-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <CardTitle className="sr-only">Hakediş ayrıntısı</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {report.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Bu dönemde miktarlı iş kaydı yok.</p>
          ) : tab === "projects" ? (
            <Table
              head={["Proje", "Tür", "Fiyatsız", "Tutar"]}
              rows={report.by_project.map((row) => [
                <Link key="p" href={`/panel/projects/${row.project_id}`} className="font-medium hover:underline">
                  {row.project_name} <span className="text-xs text-muted-foreground">{row.project_code}</span>
                </Link>,
                row.type_name,
                row.unpriced > 0 ? <span className="text-amber-700">{row.unpriced}</span> : "—",
                <span key="a" className="font-semibold">{money(row.amount)}</span>,
              ])}
            />
          ) : tab === "stages" ? (
            <Table
              head={["Tür", "Aşama", "Miktar", "Tutar"]}
              rows={report.by_stage.map((row) => [
                row.type_name,
                row.stage_name,
                formatQuantity(row.quantity, row.unit),
                <span key="a" className="font-semibold">{money(row.amount)}</span>,
              ])}
            />
          ) : tab === "leaders" ? (
            <>
              <p className="mb-3 text-xs text-muted-foreground">Bilgi amaçlıdır; ekip payı hesaplanmaz.</p>
              <Table
                head={["Ekip şefi", "Kayıt", "Tutar"]}
                rows={report.by_leader.map((row) => [row.team_leader_name, row.log_count, <span key="a" className="font-semibold">{money(row.amount)}</span>])}
              />
            </>
          ) : (
            <Table
              head={["Tarih", "Proje", "Aşama", "Miktar", "Birim fiyat", "Tutar", "Ekip şefi"]}
              rows={report.rows.map((row) => [
                formatDate(row.log_date),
                <span key="p">
                  {row.project_name}
                  {row.section_name && <span className="text-xs text-muted-foreground"> · {row.section_name}</span>}
                </span>,
                row.stage_name,
                formatQuantity(row.quantity, row.unit),
                row.unit_price === null ? <span className="text-amber-700">Fiyat yok</span> : money(row.unit_price),
                row.amount === null ? "—" : <span className="font-semibold">{money(row.amount)}</span>,
                row.team_leader_name ?? "—",
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            {head.map((label, index) => (
              <th key={label} className={cn("border-b px-3 py-2 font-medium", index === head.length - 1 && "text-right")}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, index) => (
                <td key={index} className={cn("px-3 py-2", index === cells.length - 1 && "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
