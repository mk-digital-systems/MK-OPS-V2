"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CompanySummary, CurrencyCode } from "@/types/auth";
import { CURRENCY_OPTIONS, getPeriodContaining } from "@/lib/hakedis";
import { createClient } from "@/lib/supabase/client";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function HakedisSettingsCard({ company }: { company: CompanySummary }) {
  const router = useRouter();
  const [startDay, setStartDay] = useState(company.payroll_start_day);
  const [currency, setCurrency] = useState<CurrencyCode>(company.currency_code);
  const [saving, setSaving] = useState(false);
  const example = getPeriodContaining(new Date(), startDay);
  const changed = startDay !== company.payroll_start_day || currency !== company.currency_code;

  async function save() {
    setSaving(true);
    try {
      await new HakedisRepository(createClient()).updateCompanySettings(startDay, currency);
      toast.success("Hakediş ayarları kaydedildi");
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hakediş Ayarları</CardTitle>
        <CardDescription>
          Hakediş dönemi ve para birimi. Aşama birim fiyatları yukarıdaki proje türlerinden girilir; projeye özel fiyat proje
          detayından verilebilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Dönem başlangıç günü</Label>
          <NativeSelect value={startDay} onChange={(event) => setStartDay(Number(event.target.value))}>
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                Her ayın {day}. günü
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Aktif dönem: {example.label}</p>
        </div>
        <div className="space-y-2">
          <Label>Para birimi</Label>
          <NativeSelect value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">&nbsp;</p>
        </div>
        <Button onClick={save} disabled={!changed || saving} className="sm:mb-6">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Kaydet
        </Button>
      </CardContent>
    </Card>
  );
}
