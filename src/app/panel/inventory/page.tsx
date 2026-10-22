import { createClient } from "@/lib/supabase/server";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { canWrite as canWriteCached, getCurrentUser } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Malzeme Stok",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const repository = new InventoryRepository(supabase);
  const [materials, catalogs, categories, locations, shipments, receipts, requests, personnel, canWrite, profile] = await Promise.all([
    repository.listMaterials("stock"),
    repository.listCatalogs(),
    repository.listCategories(),
    repository.listLocations(),
    repository.listShipments(),
    repository.listReceipts(),
    repository.listRequests(),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
    canWriteCached("inventory"),
    getCurrentUser(),
  ]);

  return (
    <InventoryManager
      initialMaterials={materials}
      initialCatalogs={catalogs}
      initialCategories={categories}
      initialLocations={locations}
      initialShipments={shipments}
      initialReceipts={receipts}
      initialRequests={requests}
      personnel={personnel}
      readOnly={!canWrite}
      canReceive={canWrite || profile?.role === "accounting"}
      currentUserId={profile?.id ?? null}
    />
  );
}
