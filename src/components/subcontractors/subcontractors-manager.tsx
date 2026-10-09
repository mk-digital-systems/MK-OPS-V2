"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardHat, Plus } from "lucide-react";
import type { CurrencyCode } from "@/types/auth";
import type { SubcontractorListItem } from "@/types/subcontractor";
import { formatMoney } from "@/lib/hakedis";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubcontractorFormDialog } from "@/components/subcontractors/subcontractor-form-dialog";

export function SubcontractorsManager({
  initialItems,
  currency,
}: {
  initialItems: SubcontractorListItem[];
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const showMoney = initialItems.some((item) => item.balance !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Taşeronlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Taşeron kartları, pay yüzdeleri, hakediş, harcama/ödeme ve bakiye takibi
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Yeni Taşeron
        </Button>
      </div>

      {initialItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <HardHat className="h-8 w-8" />
            Henüz taşeron yok. Taşeronla çalışmak zorunlu değil; çalışıyorsanız kartını açın, ardından Ekipler sayfasında ekiplerini
            taşerona bağlayın.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {initialItems.map((item) => (
            <Link
              key={item.id}
              href={`/panel/taseronlar/${item.id}`}
              className={cn("rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40", !item.is_active && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{item.name}</p>
                <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">%{Number(item.share_percent)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.team_count} ekip · {item.personnel_count} personel
                {!item.is_active && " · Pasif"}
              </p>
              {showMoney && item.balance !== null && (
                <p className={cn("mt-3 text-sm font-medium", Number(item.balance) < 0 ? "text-red-600" : "text-foreground")}>
                  Bakiye: {formatMoney(Math.abs(Number(item.balance)), currency)}{" "}
                  <span className="font-normal text-muted-foreground">
                    {Number(item.balance) > 0 ? "(taşerona borçlu)" : Number(item.balance) < 0 ? "(fazla ödeme)" : ""}
                  </span>
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <SubcontractorFormDialog
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={(saved) => {
          setCreating(false);
          router.push(`/panel/taseronlar/${saved.id}`);
        }}
      />
    </div>
  );
}
