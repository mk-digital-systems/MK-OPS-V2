"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import type { Personnel } from "@/types/work-plan";
import type { Vehicle } from "@/types/vehicle";
import type { AttendanceMonthApproval } from "@/types/attendance";
import type { InventoryLocation, InventoryReceipt, InventoryRequest } from "@/types/inventory";
import { formatInventoryQuantity } from "@/lib/constants/inventory";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { MONTH_NAMES } from "@/lib/constants/attendance";
import { createClient } from "@/lib/supabase/client";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { useBranches } from "@/components/layout/branch-provider";
import { PendingApprovalsCard } from "@/components/approvals/pending-approvals-card";
import { ExtraApprovalsCard } from "@/components/approvals/extra-approvals-card";
import type { PendingExtraEntry } from "@/types/hakedis";
import type { CurrencyCode } from "@/types/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Firma yöneticisi ve Merkez şantiye şefinin onay ekranı: bütün şubeler. */
export function ApprovalsCenter({
  personnel,
  vehicles,
  monthApprovals,
  year,
  month,
  requests,
  receipts,
  locations,
  currentUserId,
  pendingExtras = [],
  currency = "TRY",
}: {
  personnel: Personnel[];
  vehicles: Vehicle[];
  monthApprovals: AttendanceMonthApproval[];
  year: number;
  month: number;
  /** Onay bekleyen malzeme talepleri (talep onayı veya stok girişi onayı). */
  requests: InventoryRequest[];
  /** Şube şefi/muhasebenin girdiği, onay bekleyen irsaliyeler. */
  receipts: InventoryReceipt[];
  locations: InventoryLocation[];
  currentUserId: string | null;
  /** Fiyat onayı bekleyen imalatlar (yalnızca hakediş yetkisi olana dolu gelir). */
  pendingExtras?: PendingExtraEntry[];
  currency?: CurrencyCode;
}) {
  const router = useRouter();
  const { multiBranch, branchName } = useBranches();
  const withBranch = (branchId: string, text: string | null) =>
    [multiBranch ? branchName(branchId) : null, text].filter(Boolean).join(" · ") || null;
  const openMonths = monthApprovals.filter((item) => !item.approved_at);
  const nothingPending =
    !personnel.length && !vehicles.length && !openMonths.length && !requests.length && !receipts.length && !pendingExtras.length;
  const locationName = (id: string | null) => locations.find((item) => item.id === id)?.name ?? null;

  async function stockAction(action: (repository: InventoryRepository) => Promise<unknown>, message: string) {
    try {
      await action(new InventoryRepository(createClient()));
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("İşlem tamamlanamadı", { description: (error as Error)?.message });
    }
  }

  async function review(kind: "personnel" | "vehicle", id: string, approve: boolean) {
    const supabase = createClient();
    try {
      if (kind === "personnel") await new PersonnelRepository(supabase).review(id, approve);
      else await new VehicleRepository(supabase).review(id, approve);
      toast.success(
        kind === "personnel"
          ? approve ? "Personel onaylandı" : "Personel kaydı reddedildi"
          : approve ? "Araç onaylandı" : "Araç kaydı reddedildi"
      );
      router.refresh();
    } catch (error) {
      toast.error("İşlem tamamlanamadı", { description: (error as Error)?.message });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Onaylar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Şubelerden gelen personel ve araç kayıtları, puantaj, malzeme talebi ve imalat ek iş fiyatı onayları
        </p>
      </div>

      {nothingPending && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="font-medium">Onay bekleyen kayıt yok</p>
          </CardContent>
        </Card>
      )}

      <ExtraApprovalsCard
        entries={pendingExtras}
        currency={currency}
        branchLabel={(branchId) => (multiBranch ? branchName(branchId) : null)}
      />

      <PendingApprovalsCard
        noun="personel"
        items={personnel.map((person) => ({
          id: person.id,
          title: person.full_name,
          subtitle: withBranch(person.branch_id, [person.job_title, person.phone].filter(Boolean).join(" · ") || null),
          createdBy: person.created_by,
          createdAt: person.created_at,
        }))}
        canReview
        currentUserId={currentUserId}
        onReview={(id, approve) => review("personnel", id, approve)}
      />

      <PendingApprovalsCard
        noun="araç"
        items={vehicles.map((vehicle) => ({
          id: vehicle.id,
          title: vehicle.plate,
          subtitle: withBranch(vehicle.branch_id, `${vehicle.brand} ${vehicle.model}`),
          createdBy: vehicle.created_by,
          createdAt: vehicle.created_at,
        }))}
        canReview
        currentUserId={currentUserId}
        onReview={(id, approve) => review("vehicle", id, approve)}
      />

      {openMonths.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-amber-600" />
              Puantaj Onayı · {MONTH_NAMES[month - 1]} {year}
            </CardTitle>
            <CardDescription>Ay sonu puantajı onaylanınca ay kesinleşir ve maaş hesabına esas olur.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {openMonths.map((item) => (
              <Badge key={item.branch_id} className="bg-secondary text-secondary-foreground">{item.branch_name}</Badge>
            ))}
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link href={`/panel/attendance?year=${year}&month=${month}`}>Puantaja Git</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <PendingApprovalsCard
        noun="irsaliye"
        description="Şube şantiye şefinin veya muhasebenin girdiği irsaliyeler. Onaylanınca seçilen depoya stok olarak girer; reddedilen irsaliye silinir."
        items={receipts.map((receipt) => ({
          id: receipt.id,
          title: `${receipt.dispatch_number} · ${receipt.received_by}`,
          subtitle: withBranch(
            receipt.branch_id,
            [
              locationName(receipt.location_id),
              (receipt.lines ?? [])
                .map((line) => `${line.catalog?.material_name ?? "—"}${line.material_code ? ` (${line.material_code})` : ""} ${formatInventoryQuantity(line.quantity, line.catalog?.unit ?? "piece")}`)
                .join(", "),
            ].filter(Boolean).join(" · ")
          ),
          createdBy: receipt.created_by,
          createdAt: receipt.created_at,
        }))}
        canReview
        currentUserId={currentUserId}
        onReview={(id, approve) => stockAction((repository) => repository.reviewReceipt(id, approve), approve ? "İrsaliye onaylandı ve stoğa işlendi" : "İrsaliye reddedildi")}
      />

      {requests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Malzeme Talepleri ({requests.length})
            </CardTitle>
            <CardDescription>Talep onaylanınca şube irsaliyeyi kontrol eder; stok girişi onaylanınca malzeme şubenin deposuna girer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.map((request) => {
              const review = request.status === "receipt_review";
              const lines = review ? request.receipt_items : request.items;
              return (
                <div key={request.id} className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {request.requested_by}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {review ? `Stok girişi onayı · İrsaliye ${request.pending_dispatch_number ?? ""}` : "Talep onayı"}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {withBranch(request.branch_id, [
                        review ? locationName(request.location_id) : null,
                        lines.map((item) => `${item.catalog?.material_name ?? "—"} ${formatInventoryQuantity(item.quantity, item.catalog?.unit ?? "piece")}`).join(", "),
                      ].filter(Boolean).join(" · "))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      stockAction(
                        (repository) => (review ? repository.finalizeRequestReceipt(request.id) : repository.approveRequest(request.id)),
                        review ? "Stok girişi onaylandı" : "Talep onaylandı"
                      )
                    }
                  >
                    {review ? "Stok Girişini Onayla" : "Talebi Onayla"}
                  </Button>
                </div>
              );
            })}
            <Button asChild size="sm" variant="outline">
              <Link href="/panel/inventory">Ayrıntılar için Malzeme Stok</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
