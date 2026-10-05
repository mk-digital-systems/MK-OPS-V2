import { createClient } from "@/lib/supabase/server";
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
  const [vehicles, equipmentBalances, fuelLogs, personnel, canWrite] = await Promise.all([
    new VehicleRepository(supabase).list(),
    new InventoryRepository(supabase).listVehicleCustodyBalances(),
    new VehicleRepository(supabase).listFuelLogs(),
    new PersonnelRepository(supabase).list(),
    new UserRepository(supabase).canWrite("vehicles"),
  ]);
  return (
    <VehiclesManager
      initialVehicles={vehicles}
      equipmentBalances={equipmentBalances}
      initialFuelLogs={fuelLogs}
      personnel={personnel.filter((person) => person.is_active)}
      readOnly={!canWrite}
    />
  );
}
