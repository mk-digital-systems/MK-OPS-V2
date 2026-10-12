import { createClient } from "@/lib/supabase/server";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { AttendanceRepository } from "@/modules/attendance/attendance-repository";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { UserRepository } from "@/modules/users/user-repository";
import { ApprovalsCenter } from "@/components/approvals/approvals-center";

export const metadata = {
  title: "Onaylar",
};

/** Firma yöneticisi ve Merkez şantiye şefi: bütün şubelerin onay bekleyen kayıtları (erişim layout'ta). */
export default async function ApprovalsPage() {
  const supabase = await createClient();
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1;
  const inventory = new InventoryRepository(supabase);
  const [personnel, vehicles, monthApprovals, requests, receipts, locations, profile] = await Promise.all([
    new PersonnelRepository(supabase).list({ includePending: true }),
    new VehicleRepository(supabase).list({ includePending: true }),
    new AttendanceRepository(supabase).getMonthApprovals(year, month),
    inventory.listRequests(),
    inventory.listPendingReceipts(),
    inventory.listLocations(),
    new UserRepository(supabase).getCurrent(),
  ]);

  return (
    <ApprovalsCenter
      personnel={personnel.filter((person) => person.approval_status === "pending")}
      vehicles={vehicles.filter((vehicle) => vehicle.approval_status === "pending")}
      monthApprovals={monthApprovals}
      year={year}
      month={month}
      requests={requests.filter((request) => request.status === "requested" || request.status === "receipt_review")}
      receipts={receipts}
      locations={locations}
      currentUserId={profile?.id ?? null}
    />
  );
}
