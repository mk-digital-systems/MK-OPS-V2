"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import type { CurrencyCode } from "@/types/auth";
import type { PendingExtraEntry } from "@/types/hakedis";
import { formatMoney } from "@/lib/hakedis";
import { formatQuantity } from "@/lib/constants/project";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const toNumber = (value: string) => (value.trim() ? Number(value.replace(",", ".")) : null);

/** İmalattaki özel iş kalemleri (ek iş): hakediş yetkilisi birim fiyatları girip onaylar. */
export function ExtraApprovalsCard({
  entries,
  currency,
  branchLabel,
}: {
  entries: PendingExtraEntry[];
  currency: CurrencyCode;
  branchLabel: (branchId: string) => string | null;
}) {
  if (entries.length === 0) return null;
  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-4 w-4 text-amber-600" />
          Fiyat Onayı Bekleyen İmalatlar ({entries.length})
        </CardTitle>
        <CardDescription>
          İmalatta eklenen özel iş kalemleri projenin kalem listesine girmez. Birim fiyatlarını girip onaylayın; onaylanana kadar
          hakediş toplamına dahil değildir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map((entry) => (
          <EntryRow key={entry.entry_id} entry={entry} currency={currency} branch={branchLabel(entry.branch_id)} />
        ))}
      </CardContent>
    </Card>
  );
}

function EntryRow({ entry, currency, branch }: { entry: PendingExtraEntry; currency: CurrencyCode; branch: string | null }) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const parsed = entry.items.map((item) => ({ item, price: toNumber(prices[item.id] ?? "") }));
  const total = parsed.reduce((sum, { item, price }) => sum + (price !== null && price >= 0 ? price * Number(item.quantity) : 0), 0);

  async function approve() {
    const missing = parsed.find(({ price }) => price === null || Number.isNaN(price) || price < 0);
    if (missing) {
      toast.error(`${missing.item.item_name} için geçerli bir birim fiyat girin`);
      return;
    }
    setSaving(true);
    try {
      await new HakedisRepository(createClient()).approveExtras(
        entry.entry_id,
        parsed.map(({ item, price }) => ({ item_id: item.id, unit_price: price! }))
      );
      toast.success("Ek iş fiyatları onaylandı");
      router.refresh();
    } catch (error) {
      toast.error("Onaylanamadı", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {formatDate(entry.work_date)} · {entry.team_leader_name}
        </p>
        {branch && <p className="text-xs text-muted-foreground">{branch}</p>}
      </div>
      <ul className="space-y-2">
        {parsed.map(({ item, price }) => (
          <li key={item.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_130px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.item_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatQuantity(item.quantity, item.unit)} · {[item.project_code, item.project_name].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Input
              inputMode="decimal"
              value={prices[item.id] ?? ""}
              onChange={(event) => setPrices((current) => ({ ...current, [item.id]: event.target.value }))}
              placeholder={`Birim fiyat (${currency})`}
              aria-label={`${item.item_name} birim fiyatı`}
              disabled={saving}
            />
            <p className="text-right text-sm tabular-nums text-muted-foreground">
              {price !== null && price >= 0 ? formatMoney(price * Number(item.quantity), currency) : "—"}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
        <p className="text-sm">
          Toplam <strong className="tabular-nums">{formatMoney(total, currency)}</strong>
        </p>
        <Button size="sm" onClick={approve} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Fiyatları onayla
        </Button>
      </div>
    </div>
  );
}
