import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { CatalogsManager } from "@/components/admin/catalogs-manager";

export const metadata = {
  title: "Kataloglar",
};

export default async function AdminCatalogsPage() {
  const supabase = await createClient();
  const catalogs = await new AdminRepository(supabase).listCatalogs();
  return <CatalogsManager catalogs={catalogs} />;
}
