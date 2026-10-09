"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CurrencyCode } from "@/types/auth";
import type { Personnel } from "@/types/work-plan";
import type { PayrollRow } from "@/types/attendance";
import type {
  Subcontractor,
  SubcontractorCategory,
  SubcontractorStatement,
  Team,
} from "@/types/subcontractor";
import type { HakedisPeriod } from "@/lib/hakedis";
import { formatMoney } from "@/lib/hakedis";
import { formatDate, cn } from "@/lib/utils";
import { MONTH_NAMES } from "@/lib/constants/attendance";
import { downloadSimpleSheet } from "@/lib/simple-excel";
import { createClient } from "@/lib/supabase/client";
import { SubcontractorRepository, subcontractorErrorMessage } from "@/modules/subcontractors/subcontractor-repository";
import { useReportBrand } from "@/components/layout/company-brand-provider";
import { SubcontractorFormDialog } from "@/components/subcontractors/subcontractor-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const TABS = [
  { id: "ozet", label: "Özet ve Hakediş", money: true },
  { id: "odemeler", label: "Harcama ve Ödemeler", money: true },
  { id: "ekipler", label: "Ekipler", money: false },
  { id: "personel", label: "Personel", money: false },
  { id: "maas", label: "Maaş Dökümü", money: false },
] as const;

type TxDraft = { id: string | null; date: string; category: string; amount: string; notes: string };

export function SubcontractorDetail({
  subcontractor: initialSubcontractor,
  teams,
  personnel,
  allPersonnel,
  periods,
  start,
  end,
  statement,
  categories: initialCategories,
  payroll,
  payrollYear,
  payrollMonth,
  currency,
  initialTab,
}: {
  subcontractor: Subcontractor;
  teams: Team[];
  personnel: Personnel[];
  allPersonnel: Personnel[];
  periods: HakedisPeriod[];
  start: string;
  end: string;
  /** Hakediş yetkisi yoksa null: tutarlar gösterilmez. */
  statement: SubcontractorStatement | null;
  categories: SubcontractorCategory[];
  payroll: PayrollRow[];
  payrollYear: number;
  payrollMonth: number;
  currency: CurrencyCode;
  initialTab: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const brand = useReportBrand();
  const canSeeMoney = statement !== null;
  const tabs = TABS.filter((tab) => canSeeMoney || !tab.money);
  const [tab, setTab] = useState(tabs.some((item) => item.id === initialTab) ? initialTab : tabs[0].id);
  const [subcontractor, setSubcontractor] = useState(initialSubcontractor);
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState(initialCategories);
  const [txDraft, setTxDraft] = useState<TxDraft | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const money = (value: number | string | null | undefined) => formatMoney(value, currency);
  const leaderName = (id: string) => allPersonnel.find((person) => person.id === id)?.full_name ?? "—";
  const periodLabel = `${formatDate(start)} – ${formatDate(end)}`;
  const monthLabel = `${MONTH_NAMES[payrollMonth - 1]} ${payrollYear}`;

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    next.set("tab", tab);
    router.push(`${pathname}?${next.toString()}`);
  }

  async function withRepository(action: (repository: SubcontractorRepository, userId: string) => Promise<void>, success: string) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Oturum bulunamadı");
      await action(new SubcontractorRepository(supabase), data.user.id);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: subcontractorErrorMessage(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTransaction() {
    if (!txDraft) return;
    const amount = Number(txDraft.amount.replace(/\./g, "").replace(",", "."));
    if (!txDraft.category) return toast.error("Kategori seçin");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Tutar sıfırdan büyük olmalı");
    const ok = await withRepository(
      (repository, userId) =>
        repository.saveTransaction(
          txDraft.id,
          {
            subcontractor_id: subcontractor.id,
            category_id: txDraft.category,
            transaction_date: txDraft.date,
            amount,
            notes: txDraft.notes,
          },
          userId
        ),
      txDraft.id ? "Kayıt güncellendi" : "Kayıt eklendi"
    );
    if (ok) {
      setTxDraft(null);
      router.refresh();
    }
  }

  async function exportStatement() {
    if (!statement) return;
    await downloadSimpleSheet({
      fileName: `taseron-hakedis-${slug(subcontractor.name)}-${start}`,
      sheetName: "Taşeron Hakediş",
      title: [brand.name, `${subcontractor.name} · Taşeron hakedişi (%${Number(subcontractor.share_percent)})`, `Dönem: ${periodLabel}`],
      columns: [
        { header: "Tarih", key: "date", width: 12 },
        { header: "Proje", key: "project", width: 28 },
        { header: "İş kalemi", key: "item", width: 26 },
        { header: "Miktar", key: "quantity", width: 10 },
        { header: "Birim", key: "unit", width: 8 },
        { header: "Birim fiyat", key: "price", width: 13, money: true },
        { header: "Tutar", key: "amount", width: 14, money: true },
        { header: "Pay %", key: "percent", width: 8 },
        { header: "Taşeron tutarı", key: "share", width: 15, money: true },
        { header: "Ekip başı", key: "leader", width: 20 },
      ],
      rows: statement.rows.map((row) => ({
        date: formatDate(row.work_date),
        project: [row.project_code, row.project_name].filter(Boolean).join(" · "),
        item: row.item_name,
        quantity: Number(row.quantity),
        unit: row.unit,
        price: row.unit_price === null ? "Fiyat yok" : Number(row.unit_price),
        amount: row.amount === null ? "" : Number(row.amount),
        percent: Number(row.share_percent),
        share: row.share_amount === null ? "" : Number(row.share_amount),
        leader: row.team_leader_name,
      })),
      footer: [
        ["İşveren tutarı", Number(statement.employer_total)],
        ["Taşeron payı", Number(statement.share_total)],
        ["Önceki dönemden devreden", Number(statement.carried_balance)],
        ["Bu dönem ödenen / harcanan", Number(statement.paid_total)],
        ["Kalan bakiye", Number(statement.balance)],
      ],
    });
  }

  async function exportPayroll() {
    await downloadSimpleSheet({
      fileName: `taseron-maas-${slug(subcontractor.name)}-${payrollYear}-${String(payrollMonth).padStart(2, "0")}`,
      sheetName: "Maaş Dökümü",
      title: [brand.name, `${subcontractor.name} · Personel maaş dökümü`, monthLabel],
      columns: [
        { header: "Ad Soyad", key: "name", width: 24 },
        { header: "Aylık maaş", key: "salary", width: 14, money: true },
        { header: "Çalıştığı gün", key: "worked", width: 13 },
        { header: "Hafta tatili", key: "rest", width: 12 },
        { header: "Pazar mesaisi", key: "overtime", width: 13 },
        { header: "Devamsızlık", key: "absence", width: 12 },
        { header: "Raporlu", key: "report", width: 10 },
        { header: "Hak ediş", key: "gross", width: 14, money: true },
        { header: "Avans", key: "advance", width: 12, money: true },
        { header: "Net alacak", key: "net", width: 14, money: true },
      ],
      rows: payroll.map((row) => ({
        name: row.full_name,
        salary: Number(row.monthly_salary),
        worked: row.worked_days,
        rest: row.weekly_rest_days,
        overtime: row.overtime_days,
        absence: row.absence_days,
        report: row.report_days,
        gross: Number(row.gross_accrued) + Number(row.overtime_payment),
        advance: Number(row.advance_total),
        net: Number(row.net_receivable),
      })),
      footer: [["Toplam net alacak", payroll.reduce((sum, row) => sum + Number(row.net_receivable), 0)]],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/taseronlar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Taşeronlar
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{subcontractor.name}</h1>
              <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                Pay %{Number(subcontractor.share_percent)}
              </Badge>
              {!subcontractor.is_active && <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pasif</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[subcontractor.contact_name, subcontractor.phone, subcontractor.tax_number && `VKN ${subcontractor.tax_number}`, subcontractor.iban]
                .filter(Boolean)
                .join(" · ") || "İletişim bilgisi girilmemiş"}
            </p>
          </div>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "ozet" || tab === "odemeler") && statement && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="period">Hakediş dönemi</Label>
            <NativeSelect
              id="period"
              className="w-64"
              value={`${start}|${end}`}
              onChange={(event) => {
                const [s, e] = event.target.value.split("|");
                navigate({ start: s, end: e });
              }}
            >
              {!periods.some((period) => period.start === start && period.end === end) && <option value={`${start}|${end}`}>{periodLabel}</option>}
              {periods.map((period) => (
                <option key={period.start} value={`${period.start}|${period.end}`}>
                  {period.label}
                  {period.isActive ? " (aktif)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}

      {tab === "ozet" && statement && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="İşveren tutarı" value={money(statement.employer_total)} />
            <Stat label={`Taşeron payı (%${Number(subcontractor.share_percent)})`} value={money(statement.share_total)} />
            <Stat label="Firmaya kalan" value={money(statement.company_total)} />
            <Stat label="Bu dönem ödenen / harcanan" value={money(statement.paid_total)} />
            <Stat
              label="Kalan bakiye"
              value={money(statement.balance)}
              hint={`Devreden: ${money(statement.carried_balance)}`}
              strong
            />
          </div>
          {Number(statement.unpriced_count) > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {statement.unpriced_count} satırın fiyatı girilmemiş; fiyat girilene kadar toplamlara dahil değil.
            </p>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">Taşeron Hakedişi</CardTitle>
                <CardDescription>Taşeron ekiplerinin bu dönemdeki imalatı</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportStatement} disabled={statement.rows.length === 0}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </CardHeader>
            <CardContent>
              {statement.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Bu dönemde taşeron ekiplerinin imalatı yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">Tarih</th>
                        <th className="px-2 py-2">Proje</th>
                        <th className="px-2 py-2">İş kalemi</th>
                        <th className="px-2 py-2 text-right">Miktar</th>
                        <th className="px-2 py-2 text-right">Tutar</th>
                        <th className="px-2 py-2 text-right">Pay</th>
                        <th className="px-2 py-2 text-right">Taşeron</th>
                        <th className="px-2 py-2">Ekip başı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.rows.map((row) => (
                        <tr key={row.item_id} className="border-b last:border-0">
                          <td className="px-2 py-2">{formatDate(row.work_date)}</td>
                          <td className="px-2 py-2">{[row.project_code, row.project_name].filter(Boolean).join(" · ")}</td>
                          <td className="px-2 py-2">
                            {row.item_name}
                            {row.kind === "extra" && <span className="ml-1 text-xs text-violet-600">ek iş</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {Number(row.quantity).toLocaleString("tr-TR")} {row.unit}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{row.amount === null ? <span className="text-amber-700">fiyat yok</span> : money(row.amount)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">%{Number(row.share_percent)}</td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">{row.share_amount === null ? "—" : money(row.share_amount)}</td>
                          <td className="px-2 py-2">{row.team_leader_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "odemeler" && statement && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Harcama ve Ödemeler</CardTitle>
              <CardDescription>Taşerona yapılan ödemeler ve onun adına yapılan harcamalar bakiyeden düşer.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
                <Tags className="h-4 w-4" />
                Kategoriler
              </Button>
              <Button
                size="sm"
                onClick={() => setTxDraft({ id: null, date: new Date().toISOString().slice(0, 10), category: categories[0]?.id ?? "", amount: "", notes: "" })}
              >
                <Plus className="h-4 w-4" />
                Kayıt Ekle
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {statement.by_category.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {statement.by_category.map((item) => (
                  <Badge key={item.category_name} className="border bg-background text-foreground">
                    {item.category_name}: {money(item.amount)}
                  </Badge>
                ))}
              </div>
            )}
            {statement.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Bu dönemde kayıt yok.</p>
            ) : (
              <div className="space-y-2">
                {statement.transactions.map((tx) => (
                  <div key={tx.id} className="flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {tx.category_name} · {money(tx.amount)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(tx.transaction_date)}
                        {tx.notes ? ` · ${tx.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTxDraft({
                            id: tx.id,
                            date: tx.transaction_date,
                            category: tx.category_id,
                            amount: String(tx.amount).replace(".", ","),
                            notes: tx.notes ?? "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                        Düzenle
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        title="Kaydı sil"
                        disabled={busy}
                        onClick={async () => {
                          if (!window.confirm("Bu kayıt silinsin mi?")) return;
                          if (await withRepository((repository) => repository.removeTransaction(tx.id), "Kayıt silindi")) router.refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "ekipler" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ekipler</CardTitle>
            <CardDescription>
              Ekipleri bu taşerona <Link href="/panel/ekipler" className="text-primary underline">Ekipler</Link> sayfasından bağlayın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {teams.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Bu taşerona bağlı ekip yok.</p>}
            {teams.map((team) => (
              <div key={team.id} className="rounded-xl border px-4 py-3">
                <p className="font-medium">
                  {team.name} {!team.is_active && <span className="text-xs text-muted-foreground">(pasif)</span>}
                </p>
                <p className="text-sm text-muted-foreground">Ekip başı: {leaderName(team.leader_personnel_id)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "personel" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Taşeron Personeli</CardTitle>
            <CardDescription>
              Personel kaydında &quot;Taşeron&quot; alanı bu taşeron seçilen kişiler. Puantajları normal puantaj tablosunda tutulur; ana
              firmanın maaş dökümüne girmez.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {personnel.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Bu taşerona bağlı personel yok.</p>}
            {personnel.map((person) => (
              <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3">
                <div>
                  <Link href={`/panel/personnel/${person.id}`} className="font-medium text-primary hover:underline">
                    {person.full_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {[person.job_title, person.phone].filter(Boolean).join(" · ") || "—"}
                    {!person.is_active && " · Pasif"}
                  </p>
                </div>
                <Badge
                  className={
                    person.sgk_paid_by_main
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }
                >
                  {person.sgk_paid_by_main ? "SGK ana firmadan" : "SGK taşerondan"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "maas" && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Maaş Dökümü · {monthLabel}</CardTitle>
              <CardDescription>Taşeron personelinin puantaja dayalı maaş dökümü; taşerona gönderebilirsiniz.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                className="w-40"
                value={`${payrollYear}-${String(payrollMonth).padStart(2, "0")}`}
                onChange={(event) => event.target.value && navigate({ ay: event.target.value })}
              />
              <Button variant="outline" size="sm" onClick={exportPayroll} disabled={payroll.length === 0}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {payroll.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Bu ay için taşeron personeli yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Ad Soyad</th>
                      <th className="px-2 py-2 text-right">Maaş</th>
                      <th className="px-2 py-2 text-right">Çalıştı</th>
                      <th className="px-2 py-2 text-right">H. tatili</th>
                      <th className="px-2 py-2 text-right">Devamsız</th>
                      <th className="px-2 py-2 text-right">Avans</th>
                      <th className="px-2 py-2 text-right">Net alacak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.map((row) => (
                      <tr key={row.personnel_id} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium">{row.full_name}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.monthly_salary)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.worked_days}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.weekly_rest_days}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.absence_days}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.advance_total)}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{money(row.net_receivable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SubcontractorFormDialog
        open={editing}
        initial={subcontractor}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setSubcontractor(saved);
          setEditing(false);
          router.refresh();
        }}
      />

      <Dialog open={txDraft !== null} onOpenChange={(open) => !open && setTxDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{txDraft?.id ? "Kaydı Düzenle" : "Harcama / Ödeme Ekle"}</DialogTitle>
          </DialogHeader>
          {txDraft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tx-date">Tarih</Label>
                  <Input id="tx-date" type="date" value={txDraft.date} onChange={(event) => setTxDraft({ ...txDraft, date: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tx-amount">Tutar</Label>
                  <Input id="tx-amount" inputMode="decimal" value={txDraft.amount} onChange={(event) => setTxDraft({ ...txDraft, amount: event.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-category">Kategori</Label>
                <NativeSelect id="tx-category" value={txDraft.category} onChange={(event) => setTxDraft({ ...txDraft, category: event.target.value })}>
                  <option value="">Seçin</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-notes">Not</Label>
                <Input id="tx-notes" value={txDraft.notes} onChange={(event) => setTxDraft({ ...txDraft, notes: event.target.value })} placeholder="ör. Eylül SGK primi" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTxDraft(null)}>
                  Vazgeç
                </Button>
                <Button onClick={saveTransaction} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Kaydet
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CategoriesDialog
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChange={setCategories}
      />
    </div>
  );
}

function CategoriesDialog({
  open,
  categories,
  onClose,
  onChange,
}: {
  open: boolean;
  categories: SubcontractorCategory[];
  onClose: () => void;
  onChange: (categories: SubcontractorCategory[]) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: (repository: SubcontractorRepository) => Promise<SubcontractorCategory[]>) {
    setBusy(true);
    try {
      onChange(await action(new SubcontractorRepository(createClient())));
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: subcontractorErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Harcama / Ödeme Kategorileri</DialogTitle>
          <p className="text-sm text-muted-foreground">En fazla 10 kategori. Kullanılan kategori silinemez.</p>
        </DialogHeader>
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              {category.name}
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                disabled={busy}
                title="Kategoriyi sil"
                onClick={() =>
                  run(async (repository) => {
                    await repository.removeCategory(category.id);
                    return categories.filter((item) => item.id !== category.id);
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {categories.length < 10 && (
          <div className="flex gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Yeni kategori (ör. Malzeme)" />
            <Button
              disabled={busy || name.trim().length < 2}
              onClick={() =>
                run(async (repository) => {
                  const created = await repository.addCategory(name, categories.length + 1);
                  setName("");
                  return [...categories, created];
                })
              }
            >
              Ekle
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", strong && "border-primary/40 bg-primary/5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function slug(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (char) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[char] ?? char)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
