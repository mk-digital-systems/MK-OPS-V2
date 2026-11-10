"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHOD_LABELS, type CompanyPayment } from "@/types/admin";
import { MONTH_LABELS } from "@/lib/pricing";
import { formatTl } from "@/lib/pricing";
import { monthLabel, summarizePayments } from "@/lib/payments-summary";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { userErrorMessage } from "@/lib/user-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PaymentsManager({
  year,
  currentYear,
  payments,
}: {
  year: number;
  currentYear: number;
  payments: CompanyPayment[];
}) {
  const [query, setQuery] = useState("");
  const [voiding, setVoiding] = useState<CompanyPayment | null>(null);
  const summary = useMemo(() => summarizePayments(payments), [payments]);
  const thisMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const monthTotal = summary.byMonth.find((m) => m.month === thisMonth);
  const years = Array.from({ length: currentYear - 2026 + 2 }, (_, i) => 2026 + i);

  const rows = payments.filter((payment) => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return !needle || [payment.company_name, payment.plan, payment.note].some((v) => v?.toLocaleLowerCase("tr-TR").includes(needle));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gelir ve Ödemeler</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Şirketler → Yönet → &quot;Ödeme alındı, planı ata&quot; ile plan atadığınızda alınan ödeme otomatik olarak buraya yazılır.
            Tutarlar KDV dahil. Yanlış kayıt silinmez, <strong>iptal edilir</strong> ve gelirden düşer.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          {years.map((y) => (
            <Link
              key={y}
              href={`/admin/odemeler?yil=${y}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                y === year ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${year} toplam gelir`} value={formatTl(summary.total)} />
        <Stat label="Ödeme adedi" value={String(summary.count)} />
        <Stat label={year === currentYear ? "Bu ay" : "En yüksek ay"} value={year === currentYear ? formatTl(monthTotal?.total ?? 0) : formatTl(Math.max(0, ...summary.byMonth.map((m) => m.total)))} />
        <Stat label="Uygulanan indirim" value={formatTl(summary.discount)} hint={summary.voidedCount ? `${summary.voidedCount} iptal (${formatTl(summary.voidedTotal)}) gelire dahil değil` : undefined} />
      </div>

      {payments.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Aylara göre</h2>
              <ul className="divide-y text-sm">
                {summary.byMonth.map((m) => (
                  <li key={m.month} className="flex items-center justify-between py-1.5">
                    <span>{monthLabel(m.month)}</span>
                    <span className="text-muted-foreground">{m.count} ödeme · <span className="font-medium text-foreground">{formatTl(m.total)}</span></span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Plana göre</h2>
              <ul className="divide-y text-sm">
                {summary.byPlan.map((p) => (
                  <li key={p.plan} className="flex items-center justify-between py-1.5">
                    <span>{p.plan}</span>
                    <span className="text-muted-foreground">{p.count} ödeme · <span className="font-medium text-foreground">{formatTl(p.total)}</span></span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, plan veya not" className="pl-9" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {payments.length === 0 ? `${year} yılında kayıtlı ödeme yok.` : "Aramaya uyan ödeme yok."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((payment) => (
            <Card key={payment.id} className={cn(payment.voided_at && "opacity-60")}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("font-semibold", payment.voided_at && "line-through")}>{payment.company_name}</p>
                    <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                      {payment.plan} · {MONTH_LABELS[payment.months]}
                    </Badge>
                    {payment.voided_at && <Badge className="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200">İptal</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ödeme: {formatDate(payment.paid_on)} · {PAYMENT_METHOD_LABELS[payment.method]} · Dönem: {formatDate(payment.period_start)} – {formatDate(payment.period_end)}
                  </p>
                  {payment.note && <p className="text-xs text-muted-foreground">Not: {payment.note}</p>}
                  {payment.voided_at && <p className="text-xs text-red-700 dark:text-red-300">İptal nedeni: {payment.void_reason}</p>}
                  <p className="text-xs text-muted-foreground">Kaydeden: {payment.recorded_by_email ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-lg font-semibold", payment.voided_at && "line-through")}>{formatTl(payment.amount_tl)}</p>
                  {payment.list_price_tl !== null && Number(payment.list_price_tl) !== Number(payment.amount_tl) && (
                    <p className="text-xs text-muted-foreground">Liste: {formatTl(payment.list_price_tl)}</p>
                  )}
                </div>
                {!payment.voided_at && (
                  <Button variant="outline" size="sm" onClick={() => setVoiding(payment)}>
                    İptal et
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {voiding && <VoidDialog payment={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VoidDialog({ payment, onClose }: { payment: CompanyPayment; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) {
      toast.error("İptal nedenini yazın (en az 3 karakter)");
      return;
    }
    setBusy(true);
    try {
      await new AdminRepository(createClient()).voidPayment(payment.id, reason.trim());
      toast.success("Ödeme iptal edildi ve gelirden düşüldü");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error("İptal edilemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ödemeyi iptal et</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {payment.company_name} · {payment.plan} · {formatTl(payment.amount_tl)}. Kayıt silinmez, &quot;İptal&quot; olarak kalır
          ve gelir toplamından düşer. <strong>Firmanın planı otomatik geri alınmaz</strong>; gerekirse Şirketler sayfasından
          planı ayrıca düzeltin.
        </p>
        <div className="space-y-2">
          <Label htmlFor="void-reason">İptal nedeni</Label>
          <Input id="void-reason" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Örn. yanlış tutar girildi" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Ödemeyi iptal et
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
