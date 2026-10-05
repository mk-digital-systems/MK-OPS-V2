import { createClient } from "@/lib/supabase/server";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import { UserRepository } from "@/modules/users/user-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";

export const metadata = {
  title: "Malzeme Stok",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const repository = new InventoryRepository(supabase);
  const [materials, catalogs, movements, shipments, receipts, requests, personnel, canWrite] = await Promise.all([
    repository.listMaterials("stock"),
    repository.listCatalogs(),
    repository.listMovements(),
    repository.listShipments(),
    repository.listReceipts(),
    repository.listRequests(),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
    new UserRepository(supabase).canWrite("inventory"),
  ]);

  return (
    <InventoryManager
      initialMaterials={materials}
      initialCatalogs={catalogs}
      initialMovements={movements}
      initialShipments={shipments}
      initialReceipts={receipts}
      initialRequests={requests}
      personnel={personnel}
      readOnly={!canWrite}
    />
  );
}
