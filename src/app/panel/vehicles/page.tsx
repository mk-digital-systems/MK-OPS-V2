import { createClient } from "@/lib/supabase/server";
import { BranchRepository } from "@/modules/branches/branch-repository";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { VehiclesManager } from "@/components/vehicles/vehicles-manager";
import { UserRepository } from "@/modules/users/user-repository";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";

export const metadata = {
  title: "Araçlar",
};

export default async function VehiclesPage() {
  const supabase = await createClient();
  const myBranches = await new BranchRepository(supabase).getMine();
  const branchId = await getSelectedBranchId(myBranches.branches);
  const userRepository = new UserRepository(supabase);
  const [vehicles, equipmentBalances, fuelLogs, personnel, canWrite, profile] = await Promise.all([
    new VehicleRepository(supabase).list({ includePending: true, branchId }),
    new InventoryRepository(supabase).listVehicleCustodyBalances(),
    new VehicleRepository(supabase).listFuelLogs(),
    new PersonnelRepository(supabase).list(),
    userRepository.canWrite("vehicles"),
    userRepository.getCurrent(),
  ]);
  return (
    <VehiclesManager
      initialVehicles={vehicles}
      equipmentBalances={equipmentBalances}
      initialFuelLogs={fuelLogs}
      personnel={personnel.filter((person) => person.is_active)}
      readOnly={!canWrite}
      canCreate={canWrite || profile?.role === "accounting"}
      canReview={Boolean(myBranches.can_approve)}
      currentUserId={profile?.id ?? null}
    />
  );
}
