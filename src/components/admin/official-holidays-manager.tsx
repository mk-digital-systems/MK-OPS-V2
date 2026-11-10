"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { OfficialHoliday } from "@/types/admin";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userErrorMessage } from "@/lib/user-error";

const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const dayName = (iso: string) => DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];

export function OfficialHolidaysManager({ year, holidays }: { year: number; holidays: OfficialHoliday[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);

  async function add() {
    const count = Number(days);
    if (name.trim().length < 2) return toast.error("Tatil adını yazın (ör. Ramazan Bayramı)");
    if (!start) return toast.error("Başlangıç tarihini seçin");
    if (!Number.isInteger(count) || count < 1 || count > 5) return toast.error("Gün sayısı 1 ile 5 arasında olmalı");
    setBusy(true);
    try {
      const saved = await new AdminRepository(createClient()).saveOfficialHoliday(name, start, count);
      toast.success(`${saved} gün eklendi; tüm firmaların puantajına işlenecek`);
      setName("");
      setStart("");
      router.push(`/admin/tatiller?yil=${start.slice(0, 4)}`);
      router.refresh();
    } catch (error) {
      toast.error("Eklenemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(holiday: OfficialHoliday) {
    if (!(await confirm(`${formatDate(holiday.date)} · ${holiday.name} silinsin mi? Puantajda o gün artık resmi tatil sayılmaz.`))) return;
    try {
      await new AdminRepository(createClient()).deleteOfficialHoliday(holiday.date);
      toast.success("Silindi");
      router.refresh();
    } catch (error) {
      toast.error("Silinemedi", { description: userErrorMessage(error) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Resmi Tatiller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sabit tatiller (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim) sistemde hazır gelir.
          Ramazan ve Kurban Bayramı gibi her yıl değişen tatilleri Diyanet açıkladıktan sonra yılda bir kez buradan
          ekleyin; <strong>tüm firmaların puantajına</strong> otomatik işlenir.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">Bayram / değişken tatil ekle</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_110px_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Ad</Label>
              <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramazan Bayramı" maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-start">İlk gün</Label>
              <Input id="holiday-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-days">Gün sayısı</Label>
              <Input id="holiday-days" type="number" min={1} max={5} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button onClick={add} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Ekle
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Örnek: Ramazan Bayramı, ilk gün seçili, 3 gün. Arefe günleri (yarım gün) eklenmez. Resmi tatil kuralı
            11 Kasım 2026&apos;dan itibaren geçerlidir; önceki tarihlerin puantaj hesabı değişmez.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {[year - 1, year, year + 1].filter((value) => value >= 2026).map((value) => (
          <Button key={value} asChild variant={value === year ? "default" : "outline"} size="sm">
            <Link href={`/admin/tatiller?yil=${value}`}>{value}</Link>
          </Button>
        ))}
      </div>

      {holidays.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {year} için kayıtlı resmi tatil yok (2026&apos;da kural 11 Kasım&apos;dan başladığı için hiç tatil görünmeyebilir).
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {holidays.map((holiday) => (
            <Card key={holiday.date}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="w-28 shrink-0">
                  <p className="font-medium">{formatDate(holiday.date)}</p>
                  <p className="text-xs text-muted-foreground">{dayName(holiday.date)}</p>
                </div>
                <p className="min-w-0 flex-1 truncate text-sm">{holiday.name}</p>
                <Badge className={holiday.kind === "fixed" ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"}>
                  {holiday.kind === "fixed" ? "Sabit" : "Bayram"}
                </Badge>
                {holiday.kind === "movable" ? (
                  <Button variant="ghost" size="icon" className="text-destructive" title="Sil" onClick={() => remove(holiday)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <span className="w-9" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
