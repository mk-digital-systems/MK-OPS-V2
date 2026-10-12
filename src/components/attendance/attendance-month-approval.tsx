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

/**
 * Ay sonu puantaj onayı, şube başına. Onaylı şubenin ayı kilitlenir; onayı yalnızca firma yöneticisi kaldırır.
 * Tek şube varsa şube adı yazılmaz.
 */
export function AttendanceMonthApprovalBar({
  year,
  month,
  approvals,
  canApprove,
  canReopen,
}: {
  year: number;
  month: number;
  approvals: AttendanceMonthApproval[];
  canApprove: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const monthEnded = isMonthEnded(year, month);
  const showNames = approvals.length > 1;

  async function run(item: AttendanceMonthApproval, action: "approve" | "reopen") {
    const target = showNames ? `${item.branch_name} · ${label}` : label;
    const question =
      action === "approve"
        ? `${target} puantajı onaylanacak. Onaydan sonra bu ayın puantajı ve avansları değiştirilemez. Devam edilsin mi?`
        : `${target} puantaj onayı kaldırılacak ve ay yeniden düzenlemeye açılacak. Devam edilsin mi?`;
    if (!window.confirm(question)) return;
    setBusy(item.branch_id);
    try {
      const repository = new AttendanceRepository(createClient());
      if (action === "approve") await repository.approveMonth(year, month, item.branch_id);
      else await repository.reopenMonth(year, month, item.branch_id);
      toast.success(action === "approve" ? `${target} puantajı onaylandı` : `${target} onayı kaldırıldı`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  const visible = approvals.filter((item) => item.approved_at || monthEnded);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((item) => {
        const prefix = showNames ? `${item.branch_name} · ` : "";
        return item.approved_at ? (
          <div
            key={item.branch_id}
            className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
          >
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>
                  {prefix}
                  {label} puantajı onaylandı
                </strong>
                {item.approved_by_name ? ` · ${item.approved_by_name}` : ""} · {formatDateTime(item.approved_at)}. Bu ayın
                puantajı ve avansları kesinleşti, değiştirilemez.
              </span>
            </p>
            {canReopen && (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run(item, "reopen")}>
                {busy === item.branch_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyholeOpen className="h-4 w-4" />}
                Onayı Kaldır
              </Button>
            )}
          </div>
        ) : (
          <div
            key={item.branch_id}
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>
                  {prefix}
                  {label} puantajı onay bekliyor.
                </strong>{" "}
                Şantiye şefi veya firma yöneticisi onaylayınca ay kesinleşir; maaş ve hakediş hesapları onaylı puantaja göre yapılır.
              </span>
            </p>
            {canApprove && (
              <Button size="sm" disabled={busy !== null} onClick={() => run(item, "approve")}>
                {busy === item.branch_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Ayı Onayla
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Ayın son günü geldiyse (İstanbul saatiyle) onaylanabilir; sunucu da aynı kuralı uygular. */
function isMonthEnded(year: number, month: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return today >= lastDay;
}
