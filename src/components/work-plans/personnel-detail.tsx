"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarCheck,
  CircleOff,
  FileHeart,
  FileSpreadsheet,
  FileText,
  Phone,
  Plus,
  ShieldCheck,
  Umbrella,
  UserRound,
} from "lucide-react";
import type { Personnel, PersonnelEmploymentPeriod } from "@/types/work-plan";
import type {
  PayrollRow,
  PersonnelAdvance,
  PersonnelAttendanceDetail,
} from "@/types/attendance";
import {
  MONTH_NAMES,
  getAttendanceMeta,
  getMonthDays,
} from "@/lib/constants/attendance";
import { formatEmploymentDuration } from "@/lib/personnel";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  countAttendanceRecords,
  downloadAttendanceSummaryExcel,
  toFileSlug,
} from "@/lib/attendance-excel";
import { downloadPersonnelAttendanceWord } from "@/lib/attendance-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  personnel: Personnel;
  employmentPeriods: PersonnelEmploymentPeriod[];
  summary: PersonnelAttendanceDetail;
  year: number;
  month: number;
  payroll: PayrollRow | null;
  advances: PersonnelAdvance[];
  canWriteAdvances: boolean;
  assignedVehiclePlate?: string | null;
};

export function PersonnelDetail({
  personnel,
  employmentPeriods,
  summary,
  year,
  month,
  payroll,
  advances,
  canWriteAdvances,
  assignedVehiclePlate = null,
}: Props) {
  const router = useRouter();
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceDate, setAdvanceDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
    }).format(new Date())
  );
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceItems, setAdvanceItems] = useState(advances);

  useEffect(() => {
    setAdvanceItems(advances);
  }, [advances]);

  function updatePeriod(nextYear: number, nextMonth: number) {
    router.push(
      `/personnel/${personnel.id}?year=${nextYear}&month=${nextMonth}`
    );
  }

  const summaryCards = [
    {
      label: "Çalıştığı Gün (Mesai)",
      value: summary.month_totals.worked,
      icon: CalendarCheck,
      className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
    },
    {
      label: "Çalışmadığı Gün",
      value: summary.month_totals.absent,
      icon: CircleOff,
      className: "bg-red-50 text-red-700 dark:bg-red-950/40",
    },
    {
      label: "Kullandığı İzin",
      value: summary.month_totals.leave,
      icon: Umbrella,
      className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40",
    },
    {
      label: "Raporlu Gün",
      value: summary.month_totals.medical_report,
      icon: FileHeart,
      className: "bg-sky-50 text-sky-700 dark:bg-sky-950/40",
    },
    {
      label: "Hafta Tatili",
      value: summary.month_totals.weekly_rest,
      icon: ShieldCheck,
      className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40",
    },
  ];
  const monthDays = getMonthDays(year, month);
  const selectedMonthTotals = countAttendanceRecords(summary.month_records);
  const recordsByDate = new Map(
    summary.month_records.map((record) => [record.date, record])
  );
  const money = (value: number | null | undefined) =>
    `₺${Number(value ?? 0).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  async function saveAdvance() {
    const amount = Number(advanceAmount.replace(",", "."));
    if (!advanceDate || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir tarih ve avans tutarı girin");
      return;
    }
    setAdvanceSaving(true);
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Oturum bulunamadı");
      const { data: savedAdvance, error } = await supabase
        .from("personnel_advances")
        .insert({
          personnel_id: personnel.id,
          advance_date: advanceDate,
          amount,
          notes: advanceNotes.trim() || null,
          created_by: authData.user.id,
        })
        .select("id, personnel_id, advance_date, amount, notes, created_at")
        .single();
      if (error) throw error;
      setAdvanceItems((current) => [
        { ...savedAdvance, amount: Number(savedAdvance.amount) } as PersonnelAdvance,
        ...current,
      ]);
      toast.success("Avans kaydedildi");
      setAdvanceOpen(false);
      setAdvanceAmount("");
      setAdvanceNotes("");
      router.refresh();
    } catch (error) {
      console.error(error);
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : error instanceof Error
            ? error.message
            : "Supabase kaydı oluşturulamadı";
      toast.error("Avans kaydedilemedi", { description: message });
    } finally {
      setAdvanceSaving(false);
    }
  }

  async function exportPersonnelExcel() {
    try {
      await downloadAttendanceSummaryExcel({
        personnel: [
          {
            fullName: personnel.full_name,
            tcIdentityNumber: personnel.tc_identity_number,
            records: summary.month_records,
          },
        ],
        year,
        month,
        fileName: `${toFileSlug(personnel.full_name)}-puantaj-${year}-${String(
          month
        ).padStart(2, "0")}.xlsx`,
      });
    } catch (error) {
      console.error(error);
      toast.error("Personel puantaj Excel dosyası oluşturulamadı");
    }
  }

  async function exportPersonnelWord() {
    try {
      await downloadPersonnelAttendanceWord({
        person: {
          fullName: personnel.full_name,
          tcIdentityNumber: personnel.tc_identity_number,
          records: summary.month_records,
        },
        year,
        month,
      });
    } catch (error) {
      console.error(error);
      toast.error("Personel Word puantaj raporu oluşturulamadı");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
          <Link href="/personnel">
            <ArrowLeft className="h-4 w-4" />
            Personel Listesine Dön
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {personnel.full_name}
                </h1>
                <Badge
                  className={
                    personnel.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }
                >
                  {personnel.is_active ? "Aktif" : "Pasif"}
                </Badge>
                {assignedVehiclePlate && (
                  <Badge className="border bg-background text-foreground">
                    {assignedVehiclePlate}
                  </Badge>
                )}
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                {personnel.phone || "Telefon numarası girilmemiş"}
              </p>
              <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                <span>
                  Görev: {personnel.job_title?.trim() || "-"}
                </span>
                <span>
                  TC Kimlik No: {personnel.tc_identity_number || "-"}
                </span>
                <span className="font-semibold text-foreground">
                  Aylık Maaş: {money(personnel.monthly_salary)}
                </span>
                <span>
                  İşe Giriş: {formatDate(personnel.employment_start_date)}
                </span>
                <span>
                  İşten Ayrılış: {formatDate(personnel.employment_end_date)}
                </span>
                {!personnel.is_active && personnel.termination_reason && (
                  <span className="sm:col-span-2">
                    Çıkış Sebebi: {personnel.termination_reason}
                  </span>
                )}
                <span className="sm:col-span-2">
                  Çalışma Süresi:{" "}
                  {formatEmploymentDuration(
                    personnel.employment_start_date,
                    personnel.employment_end_date
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" onClick={exportPersonnelWord}>
              <FileText className="h-4 w-4" />
              Word Puantaj Raporu
            </Button>
            <Button
              variant="outline"
              onClick={exportPersonnelExcel}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Puantaj Excel İndir
            </Button>
            <Select
              value={String(month)}
              onValueChange={(value) => updatePeriod(year, Number(value))}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, index) => (
                  <SelectItem key={name} value={String(index + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(year)}
              onValueChange={(value) => updatePeriod(Number(value), month)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 11 }, (_, index) => {
                  const optionYear = new Date().getFullYear() - 5 + index;
                  return (
                    <SelectItem
                      key={optionYear}
                      value={String(optionYear)}
                    >
                      {optionYear}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-3xl font-semibold">{card.value}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${card.className}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-xs text-muted-foreground">
              Mazeretsiz Gelmedi
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {selectedMonthTotals.unexcused_absence}
            </p>
          </div>
          <div className="rounded-xl bg-orange-50 p-2.5 text-orange-700 dark:bg-orange-950/40">
            <CircleOff className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {employmentPeriods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Geçmiş Çalışma Dönemleri</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {employmentPeriods.map((period) => (
                <div
                  key={period.id}
                  className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[150px_150px_160px_1fr]"
                >
                  <span>
                    Giriş: {formatDate(period.employment_start_date)}
                  </span>
                  <span>Çıkış: {formatDate(period.employment_end_date)}</span>
                  <span>
                    Süre:{" "}
                    {formatEmploymentDuration(
                      period.employment_start_date,
                      period.employment_end_date
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {period.termination_reason}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {MONTH_NAMES[month - 1]} {year} Maaş ve Hakediş
            </CardTitle>
            {canWriteAdvances && (
              <Button size="sm" onClick={() => setAdvanceOpen(true)}>
                <Plus className="h-4 w-4" />
                Avans Ekle
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Aylık Maaş", money(payroll?.monthly_salary ?? personnel.monthly_salary)],
              ["Çalıştığı Gün", `${payroll?.worked_days ?? 0} gün`],
              ["HT", `${payroll?.weekly_rest_days ?? 0} gün`],
              ["Pazar Mesaisi", `${payroll?.overtime_days ?? 0} gün`],
              ["Brüt Hakediş", money(payroll?.gross_accrued)],
              ["Avans Toplamı", money(payroll?.advance_total)],
              ["Net Alacak", money(payroll?.net_receivable)],
              ["Hak Edilen Gün", `${payroll?.payable_days ?? 0} gün`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Avans Dökümü</p>
            {advanceItems.length === 0 ? (
              <p className="rounded-xl border p-3 text-sm text-muted-foreground">
                Bu ay için avans kaydı bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2">
                {advanceItems.map((advance) => (
                  <div key={advance.id} className="flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatDate(advance.advance_date)}</p>
                      <p className="text-xs text-muted-foreground">{advance.notes?.trim() || "Açıklama yok"}</p>
                    </div>
                    <strong>{money(advance.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avans Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="advance_date">Tarih</Label>
              <Input id="advance_date" type="date" value={advanceDate} onChange={(event) => setAdvanceDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="advance_amount">Tutar (₺)</Label>
              <Input id="advance_amount" type="number" min="0.01" step="0.01" value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="advance_notes">Açıklama (Opsiyonel)</Label>
              <Textarea id="advance_notes" value={advanceNotes} onChange={(event) => setAdvanceNotes(event.target.value)} />
            </div>
            <Button className="w-full" onClick={saveAdvance} disabled={advanceSaving}>
              {advanceSaving ? "Kaydediliyor..." : "Avansı Kaydet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {MONTH_NAMES[month - 1]} {year} Puantaj Özeti
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
            {personnel.full_name}, bu ay{" "}
            <strong>{summary.month_totals.worked} gün</strong> çalıştı,{" "}
            <strong>{summary.month_totals.leave} gün</strong> izin kullandı,{" "}
            <strong>{summary.month_totals.medical_report} gün</strong> raporlu
            ve <strong>{summary.month_totals.weekly_rest} gün</strong> hafta
            tatilindeydi.
          </p>

          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const record = recordsByDate.get(day.isoDate);
                const meta = record ? getAttendanceMeta(record.status) : null;
                return (
                  <div
                    key={day.isoDate}
                    title={meta?.label ?? "Puantaj kaydı yok"}
                    className={`rounded-xl border p-2 text-center ${
                      day.isSunday ? "bg-cyan-50 dark:bg-cyan-950/30" : ""
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground">
                      {String(day.day).padStart(2, "0")} {day.dayName}
                    </p>
                    <p className="mt-1 text-base font-bold">
                      {meta?.symbol ?? "·"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{year} Yıllık Özet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ["Çalıştı", summary.year_totals.worked],
              ["Çalışmadı", summary.year_totals.absent],
              ["İzinli", summary.year_totals.leave],
              ["Raporlu", summary.year_totals.medical_report],
              ["Hafta Tatili", summary.year_totals.weekly_rest],
              ["Pazar Mesaisi", summary.year_totals.sunday_worked],
              ["Toplam Kayıt", summary.year_totals.total],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aylara Göre Dağılım</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {summary.month_distribution.map((item) => (
              <button
                key={item.month_number}
                type="button"
                onClick={() => updatePeriod(year, item.month_number)}
                className={`rounded-xl border p-3 text-left transition-colors hover:bg-muted ${
                  item.month_number === month ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {MONTH_NAMES[item.month_number - 1]}
                  </span>
                  <span className="text-sm font-semibold">{item.total}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Çalıştı {item.worked} · İzin {item.leave} · Rapor{" "}
                  {item.medical_report}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Yıllara Göre İzin Kullanımı
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.leave_history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                İzin kaydı bulunmuyor.
              </p>
            ) : (
              summary.leave_history.map((item) => (
                <button
                  key={item.year}
                  type="button"
                  onClick={() => updatePeriod(item.year, month)}
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 hover:bg-muted"
                >
                  <span>{item.year}</span>
                  <strong>{item.days} gün</strong>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notlar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">
            {personnel.notes?.trim() || "Personel notu girilmemiş."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
