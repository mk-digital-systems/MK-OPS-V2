"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Loader2, LockKeyholeOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { AttendanceMonthApproval } from "@/types/attendance";
import { MONTH_NAMES } from "@/lib/constants/attendance";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AttendanceRepository } from "@/modules/attendance/attendance-repository";
import { Button } from "@/components/ui/button";

/** Ay sonu puantaj onayı: onaylı ay kilitlenir; onayı yalnızca firma yöneticisi kaldırır. */
export function AttendanceMonthApprovalBar({
  year,
  month,
  approval,
  canApprove,
  canReopen,
}: {
  year: number;
  month: number;
  approval: AttendanceMonthApproval | null;
  canApprove: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const monthEnded = isMonthEnded(year, month);

  async function run(action: "approve" | "reopen") {
    const question =
      action === "approve"
        ? `${label} puantajı onaylanacak. Onaydan sonra bu ayın puantajı ve avansları değiştirilemez. Devam edilsin mi?`
        : `${label} puantaj onayı kaldırılacak ve ay yeniden düzenlemeye açılacak. Devam edilsin mi?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const repository = new AttendanceRepository(createClient());
      if (action === "approve") await repository.approveMonth(year, month);
      else await repository.reopenMonth(year, month);
      toast.success(action === "approve" ? `${label} puantajı onaylandı` : `${label} onayı kaldırıldı`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(false);
    }
  }

  if (approval) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{label} puantajı onaylandı</strong>
            {approval.approved_by_name ? ` · ${approval.approved_by_name}` : ""} · {formatDateTime(approval.approved_at)}.
            Bu ayın puantajı ve avansları kesinleşti, değiştirilemez.
          </span>
        </p>
        {canReopen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run("reopen")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyholeOpen className="h-4 w-4" />}
            Onayı Kaldır
          </Button>
        )}
      </div>
    );
  }

  if (!monthEnded) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>{label} puantajı onay bekliyor.</strong> Şantiye şefi veya firma yöneticisi onaylayınca ay kesinleşir;
          maaş ve hakediş hesapları onaylı puantaja göre yapılır.
        </span>
      </p>
      {canApprove && (
        <Button size="sm" disabled={busy} onClick={() => run("approve")}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Ayı Onayla
        </Button>
      )}
    </div>
  );
}

/** Ayın son günü geldiyse (İstanbul saatiyle) onaylanabilir; sunucu da aynı kuralı uygular. */
function isMonthEnded(year: number, month: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return parts >= lastDay;
}
