import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { VehiclesManager } from "@/components/vehicles/vehicles-manager";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { canWrite, getCurrentUser, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Araçlar",
};

export default async function VehiclesPage() {
  const supabase = await createClient();
  const myBranches = await getMyBranches();
  const branchId = await getSelectedBranchId(myBranches.branches);
  const [vehicles, equipmentBalances, fuelLogs, personnel, canEdit, profile] = await Promise.all([
    new VehicleRepository(supabase).list({ includePending: true, branchId }),
    new InventoryRepository(supabase).listVehicleCustodyBalances(),
    new VehicleRepository(supabase).listFuelLogs(),
    new PersonnelRepository(supabase).list(),
    canWrite("vehicles"),
    getCurrentUser(),
  ]);
  return (
    <VehiclesManager
      initialVehicles={vehicles}
      equipmentBalances={equipmentBalances}
      initialFuelLogs={fuelLogs}
      personnel={personnel.filter((person) => person.is_active)}
      readOnly={!canEdit}
      canCreate={canEdit || profile?.role === "accounting"}
      canReview={Boolean(myBranches.can_approve)}
      currentUserId={profile?.id ?? null}
    />
  );
}
