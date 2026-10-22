import { createClient } from "@/lib/supabase/server";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { CustodyManager } from "@/components/inventory/custody-manager";
import { canWrite as canWriteCached } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Araç Ekipmanları",
};

export default async function CustodyPage() {
  const supabase = await createClient();
  const inventoryRepository = new InventoryRepository(supabase);
  const [
    materials,
    balances,
    movements,
    vehicles,
    canWrite,
  ] = await Promise.all([
    inventoryRepository.listMaterials("equipment"),
    inventoryRepository.listCustodyBalances(),
    inventoryRepository.listCustodyMovements(),
    new VehicleRepository(supabase).list(),
    canWriteCached("custody"),
  ]);

  return (
    <CustodyManager
      initialMaterials={materials}
      initialBalances={balances}
      initialMovements={movements}
      vehicles={vehicles}
      readOnly={!canWrite}
    />
  );
}
