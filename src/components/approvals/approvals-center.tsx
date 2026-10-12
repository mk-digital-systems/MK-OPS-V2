"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import type { Personnel } from "@/types/work-plan";
import type { Vehicle } from "@/types/vehicle";
import type { AttendanceMonthApproval } from "@/types/attendance";
import { MONTH_NAMES } from "@/lib/constants/attendance";
import { createClient } from "@/lib/supabase/client";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { useBranches } from "@/components/layout/branch-provider";
import { PendingApprovalsCard } from "@/components/approvals/pending-approvals-card";
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
  requestCounts,
  currentUserId,
}: {
  personnel: Personnel[];
  vehicles: Vehicle[];
  monthApprovals: AttendanceMonthApproval[];
  year: number;
  month: number;
  requestCounts: { requested: number; receiptReview: number };
  currentUserId: string | null;
}) {
  const router = useRouter();
  const { multiBranch, branchName } = useBranches();
  const withBranch = (branchId: string, text: string | null) =>
    [multiBranch ? branchName(branchId) : null, text].filter(Boolean).join(" · ") || null;
  const openMonths = monthApprovals.filter((item) => !item.approved_at);
  const requestTotal = requestCounts.requested + requestCounts.receiptReview;
  const nothingPending = !personnel.length && !vehicles.length && !openMonths.length && !requestTotal;

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
          Şubelerden gelen personel ve araç kayıtları, puantaj ve malzeme talebi onayları
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

      {requestTotal > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Malzeme Talepleri
            </CardTitle>
            <CardDescription>
              {[
                requestCounts.requested ? `${requestCounts.requested} talep onay bekliyor` : null,
                requestCounts.receiptReview ? `${requestCounts.receiptReview} irsaliye stok girişi onayı bekliyor` : null,
              ].filter(Boolean).join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/panel/inventory">Malzeme Stoğa Git</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
