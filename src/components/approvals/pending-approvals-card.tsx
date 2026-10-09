"use client";

import { useState } from "react";
import { Check, Clock3, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export type PendingApprovalItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  createdBy: string | null;
  createdAt: string;
};

/**
 * Muhasebenin eklediği, şantiye şefi veya firma yöneticisi onayı bekleyen kayıtlar.
 * Onaylayan kişi onay/ret düğmelerini görür; kaydı ekleyen muhasebe kendi kaydını düzeltebilir.
 */
export function PendingApprovalsCard({
  noun,
  items,
  canReview,
  currentUserId,
  onReview,
  onEdit,
}: {
  /** "personel", "araç" */
  noun: string;
  items: PendingApprovalItem[];
  canReview: boolean;
  currentUserId: string | null;
  onReview: (id: string, approve: boolean) => Promise<void>;
  onEdit?: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function review(id: string, approve: boolean) {
    if (!approve && !window.confirm(`Bu ${noun} kaydı reddedilip silinecek. Devam edilsin mi?`)) return;
    setBusy(`${id}-${approve}`);
    try {
      await onReview(id, approve);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-amber-600" />
          Onay Bekleyen {noun.charAt(0).toLocaleUpperCase("tr-TR") + noun.slice(1)} ({items.length})
        </CardTitle>
        <CardDescription>
          {canReview
            ? `Muhasebenin eklediği kayıtlar. Onaylanana kadar puantajda, iş planında ve seçim listelerinde görünmez.`
            : `Eklediğiniz kayıtlar şantiye şefi veya firma yöneticisi onaylayınca kullanıma açılır.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              {item.subtitle && <p className="text-sm text-muted-foreground">{item.subtitle}</p>}
              <p className="text-xs text-muted-foreground">Eklendi: {formatDateTime(item.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              {onEdit && !canReview && item.createdBy === currentUserId && (
                <Button variant="outline" size="sm" onClick={() => onEdit(item.id)}>
                  <Pencil className="h-4 w-4" />
                  Düzenle
                </Button>
              )}
              {canReview && (
                <>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => review(item.id, false)}>
                    {busy === `${item.id}-false` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Reddet
                  </Button>
                  <Button size="sm" disabled={busy !== null} onClick={() => review(item.id, true)}>
                    {busy === `${item.id}-true` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Onayla
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
